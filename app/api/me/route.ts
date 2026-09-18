import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/auth";
import { boot } from "@/lib/boot";
import { resolveDeviceToken } from "@/lib/users";

/**
 * Who am I. Answers to a session or a device token, so the extension's
 * options page and a phone can confirm a token works before relying on it.
 */
export async function GET(req: NextRequest) {
  await boot();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const user = bearer ? await resolveDeviceToken(bearer) : await currentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
}
