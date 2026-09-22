import { NextRequest, NextResponse } from "next/server";
import { createOpenTerm, setHumanTag } from "@/ai/apply-tags";
import { currentUser } from "@/auth";
import { boot } from "@/lib/boot";
import { createTerm, findLike } from "@/taxonomy/terms";

/**
 * A person adds a word to the vocabulary, optionally tagging a picture with it
 * in the same request. A haus goes straight in (open facet). Any other word is
 * first matched against what exists: an identical term is reused; a near
 * miss comes back as 409 with the candidates, and the person answers with
 * `use` (that term), `synonymOf` (same thing, remember my word) or `force`
 * (it is different). The model never comes through here (FR-23).
 */
export async function POST(req: NextRequest) {
  await boot();
  const user = await currentUser();
  if (!user || user.role === "viewer") return NextResponse.json({ error: "not allowed" }, { status: 403 });

  const body = (await req.json()) as { facet?: string; label?: string; itemId?: string; synonymOf?: string; use?: string; force?: boolean };
  if (!body.label && !body.use) return NextResponse.json({ error: "label required" }, { status: 400 });

  try {
    let termId: string;
    let out: Record<string, unknown> = {};
    if (body.use) {
      termId = body.use;
      out = { termId, created: false, merged: false };
    } else if (body.facet === "project") {
      const r = await createOpenTerm("project", body.label!, user.id);
      termId = r.termId;
      out = { ...r };
    } else {
      if (!body.facet && !body.synonymOf) return NextResponse.json({ error: "facet required" }, { status: 400 });
      if (!body.synonymOf && !body.force) {
        const like = await findLike(body.label!);
        // The same term, spelled the same: reuse it. Anything else that looks
        // like it, a synonym someone recorded or a near miss, is a question.
        if (like.exact && like.exact.via === "exact") {
          termId = like.exact.id;
          out = { termId, created: false, merged: false, matched: like.exact };
        } else if (like.exact || like.near.length) {
          return NextResponse.json({ near: [...(like.exact ? [like.exact] : []), ...like.near.filter((n) => n.id !== like.exact?.id)], label: body.label }, { status: 409 });
        }
      }
      if (!out.termId) {
        const r = await createTerm({ facetKey: body.facet ?? "", label: body.label!, synonymOf: body.synonymOf }, user.id);
        termId = r.termId;
        out = { ...r };
      }
      termId = String(out.termId);
    }
    if (body.itemId) await setHumanTag(body.itemId, termId, "add", user.id);
    return NextResponse.json(out);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}
