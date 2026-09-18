import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { boot } from "@/lib/boot";
import { listProposals, listTerms, promoteProposal, rejectProposal, setSynonyms, setTermStatus } from "@/taxonomy/admin";
import { Nav } from "../ui/nav";

export const dynamic = "force-dynamic";

/**
 * REF-01 FR-16, FR-23. The vocabulary owner's page. Proposals first, because
 * they are the ten-minutes-a-week job; then every term with how often it is
 * used, so a term nobody uses can be retired and a synonym can be added
 * without touching code.
 */
export default async function TaxonomyPage() {
  await boot();
  const user = await requireUser();
  const [proposals, terms] = await Promise.all([listProposals(), listTerms()]);
  const canEdit = user.role !== "viewer";

  async function decide(formData: FormData) {
    "use server";
    const u = await requireUser();
    if (u.role === "viewer") return;
    const id = String(formData.get("id"));
    if (formData.get("what") === "promote") await promoteProposal(id, u.id, { label: String(formData.get("label") ?? "") || undefined });
    else await rejectProposal(id, u.id);
    revalidatePath("/taxonomy");
  }

  async function edit(formData: FormData) {
    "use server";
    const u = await requireUser();
    if (u.role === "viewer") return;
    const id = String(formData.get("id"));
    const what = String(formData.get("what"));
    if (what === "retire" || what === "active") await setTermStatus(id, what === "retire" ? "retired" : "active", u.id);
    if (what === "synonyms") await setSynonyms(id, String(formData.get("synonyms") ?? "").split(","), u.id);
    revalidatePath("/taxonomy");
  }

  const byFacet = new Map<string, typeof terms>();
  for (const t of terms) byFacet.set(t.facetLabel, [...(byFacet.get(t.facetLabel) ?? []), t]);

  return (
    <div>
      <Nav user={user} />
      <div style={{ padding: 20, maxWidth: 1100 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontWeight: 400, margin: "0 0 4px" }}>Vocabulary</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          The words the library is described in. Closed facets grow only from the model's proposals below; a person says yes or no.
          The model is told about a new word on its very next image.
        </p>

        <div className="panel">
          <h3>Proposed by the model ({proposals.length})</h3>
          {proposals.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>Nothing pending. The model puts a concept here when it sees it clearly and the vocabulary has no word for it.</p>
          ) : (
            <div className="attention-list">
              {proposals.map((p) => (
                <div className="attention-row" key={p.id}>
                  {p.sample && <img src={`/api/asset/${p.sample}/thumb`} alt="" className="thumb" />}
                  <div style={{ flex: 1 }}>
                    <div><b>{p.label}</b> <span className="hint">in {p.facetLabel}</span></div>
                    <div className="hint">seen {p.occurrences} {p.occurrences === 1 ? "time" : "times"}</div>
                  </div>
                  {canEdit && (
                    <>
                      <form action={decide} style={{ display: "flex", gap: 6 }}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="what" value="promote" />
                        <input className="search" name="label" defaultValue={p.label} style={{ padding: "5px 8px", fontSize: 12, width: 180 }} />
                        <button className="btn" data-primary="true" type="submit">Add to vocabulary</button>
                      </form>
                      <form action={decide}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="what" value="reject" />
                        <button className="btn" type="submit">No</button>
                      </form>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {[...byFacet.entries()].map(([facet, list]) => (
          <div className="panel" key={facet}>
            <h3>{facet} <span className="hint">({list.filter((t) => t.status === "active").length} active{list[0]?.isOpen ? ", open: anyone adds from an image" : ""})</span></h3>
            <table className="table">
              <thead><tr><th>Term</th><th>Synonyms (comma-separated, make search find it)</th><th>Uses</th><th></th></tr></thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id} style={{ opacity: t.status === "retired" ? 0.5 : 1 }}>
                    <td>{t.label}{t.status === "retired" && <span className="hint"> · retired</span>}</td>
                    <td>
                      {canEdit ? (
                        <form action={edit} style={{ display: "flex", gap: 6 }}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="what" value="synonyms" />
                          <input className="search" name="synonyms" defaultValue={t.synonyms.join(", ")} style={{ padding: "4px 8px", fontSize: 12 }} />
                          <button className="btn" type="submit" style={{ padding: "4px 10px" }}>Save</button>
                        </form>
                      ) : t.synonyms.join(", ")}
                    </td>
                    <td>{t.uses}</td>
                    <td>
                      {canEdit && (
                        <form action={edit}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="what" value={t.status === "retired" ? "active" : "retire"} />
                          <button className="btn" type="submit" style={{ padding: "4px 10px" }}>{t.status === "retired" ? "Restore" : "Retire"}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
