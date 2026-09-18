import { NextRequest, NextResponse } from "next/server";
import { loadTaxonomy } from "@/ai/tag-schema";
import { currentUser } from "@/auth";
import { boot } from "@/lib/boot";
import { resolveDeviceToken } from "@/lib/users";

/** The live vocabulary, for the extension popup and anything else that needs to offer a haus. */
export async function GET(req: NextRequest) {
  await boot();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const user = bearer ? await resolveDeviceToken(bearer) : await currentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const facets = await loadTaxonomy();
  return NextResponse.json({
    facets: facets.map((f) => ({
      key: f.key, label: f.label, isMulti: f.isMulti, isOpen: f.isOpen, aiTagged: f.aiTagged,
      terms: f.terms.map((t) => ({ slug: t.slug, label: t.label })),
    })),
  });
}
