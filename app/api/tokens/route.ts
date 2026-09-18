import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/auth";
import { boot } from "@/lib/boot";
import { createDeviceToken, revokeDeviceToken } from "@/lib/users";

export async function POST(req: NextRequest) {
  await boot();
  const user = await currentUser();
  if (!user || user.role === "viewer") return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const { label } = (await req.json()) as { label?: string };
  const t = await createDeviceToken(user.id, label ?? "phone");
  return NextResponse.json({ id: t.id, token: t.token, label: label ?? "phone" });
}

export async function DELETE(req: NextRequest) {
  await boot();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const { id } = (await req.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await revokeDeviceToken(id, user.id);
  return NextResponse.json({ ok: true });
}
