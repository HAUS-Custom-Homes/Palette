import Link from "next/link";
import type { User } from "@/lib/users";

export function Nav({ user, attention = 0 }: { user: User; attention?: number }) {
  return (
    <div className="nav">
      <Link href="/">Library</Link>
      <Link href="/boards">Boards</Link>
      <Link href="/attention">
        Needs me{attention > 0 && <span className="pill">{attention}</span>}
      </Link>
      <Link href="/settings">Phone and settings</Link>
      <span className="spacer" />
      <span className="who">{user.name ?? user.email} · {user.role}</span>
      <Link href="/api/auth/signout">Sign out</Link>
    </div>
  );
}
