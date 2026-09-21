import Link from "next/link";
import type { ReactNode } from "react";
import type { User } from "@/lib/users";

/**
 * The four places people go every day stay in the bar. Everything that is
 * setup or housekeeping lives behind the person's initials, so the bar reads
 * as a product and not as a site map. On the library the bar also holds the
 * one box that searches and saves (`search`), so the pictures start right
 * under it.
 */
export function Nav({ user, attention = 0, at, search }: { user: User; attention?: number; at?: "library" | "boards" | "attention" | "capture"; search?: ReactNode }) {
  const initials = (user.name ?? user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <div className="nav">
      <Link href="/" className="mark">Palette<b>.</b></Link>
      <Link href="/" data-on={at === "library"}>Library</Link>
      <Link href="/boards" data-on={at === "boards"}>Lookbooks</Link>
      <Link href="/attention" data-on={at === "attention"}>
        Needs me{attention > 0 && <span className="pill">{attention}</span>}
      </Link>
      {search ?? <span className="spacer" />}
      <Link href="/capture" className="btn solid">+ Save</Link>
      <details className="more">
        <summary><span className="avatar" title={user.email}>{initials}</span></summary>
        <div className="menu">
          <span>{user.name ?? user.email} · {user.role}</span>
          <Link href="/install">Get the app and share sheet</Link>
          <Link href="/settings">Phone and settings</Link>
          <Link href="/taxonomy">Vocabulary</Link>
          <Link href="/backfill">Backfill</Link>
          <Link href="/people">People</Link>
          <Link href="/api/auth/signout">Sign out</Link>
        </div>
      </details>
    </div>
  );
}
