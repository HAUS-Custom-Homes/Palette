"use client";

import { useState } from "react";

type Token = { id: string; label: string; created_at: string; last_used_at: string | null; revoked_at: string | null };

/**
 * The token is shown exactly once, here, and never travels in a URL.
 * Only its hash is stored.
 */
export function Tokens({ initial }: { initial: Token[] }) {
  const [tokens, setTokens] = useState(initial);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<{ label: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/tokens", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label }) });
      const json = (await res.json()) as { id: string; token: string; label: string };
      setFresh({ label: json.label, token: json.token });
      setTokens([{ id: json.id, label: json.label, created_at: new Date().toISOString(), last_used_at: null, revoked_at: null }, ...tokens]);
      setLabel("");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await fetch("/api/tokens", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    setTokens(tokens.map((t) => (t.id === id ? { ...t, revoked_at: new Date().toISOString() } : t)));
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <input className="search" placeholder="phone name, e.g. Trevor iPhone" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="btn" data-primary="true" disabled={busy || !label.trim()} onClick={() => void create()}>New phone token</button>
      </div>

      {fresh && (
        <div className="notice" data-kind="attention" style={{ margin: "0 0 10px" }}>
          <b>Token for {fresh.label}. Copy it now; it will not be shown again.</b>
          <div style={{ fontFamily: "monospace", fontSize: 13, marginTop: 6, wordBreak: "break-all", userSelect: "all" }}>{fresh.token}</div>
        </div>
      )}

      {tokens.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>No phones yet.</p>
      ) : (
        <table className="table">
          <thead><tr><th>Phone</th><th>Created</th><th>Last used</th><th></th></tr></thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id} style={{ opacity: t.revoked_at ? 0.45 : 1 }}>
                <td>{t.label}{t.revoked_at && " (revoked)"}</td>
                <td>{t.created_at.slice(0, 10)}</td>
                <td>{t.last_used_at ? t.last_used_at.slice(0, 16).replace("T", " ") : "never"}</td>
                <td>{!t.revoked_at && <button className="btn" onClick={() => void revoke(t.id)}>Revoke</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
