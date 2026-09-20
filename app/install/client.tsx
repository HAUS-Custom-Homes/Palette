"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * Chrome, Edge and Android fire beforeinstallprompt when the app can be
 * installed. Holding on to it lets the page offer a real button instead of
 * sending people hunting through a browser menu.
 */
export function InstallButton() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [state, setState] = useState<"idle" | "installed" | "unavailable">("idle");

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) setState("installed");
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    const onInstalled = () => setState("installed");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const t = setTimeout(() => setState((s) => (s === "idle" ? "unavailable" : s)), 2500);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); clearTimeout(t); };
  }, []);

  if (state === "installed") return <span className="pill">Installed on this device</span>;
  return (
    <button type="button" className="btn solid" disabled={!evt}
            onClick={async () => { if (!evt) return; await evt.prompt(); const c = await evt.userChoice; if (c.outcome === "accepted") setState("installed"); setEvt(null); }}>
      {evt ? "Install Palette" : state === "unavailable" ? "Use the browser menu to install" : "Install Palette"}
    </button>
  );
}

/** A key for this phone, shown once, with a copy button. Only its hash is kept on the server. */
export function PhoneToken() {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function make() {
    setBusy(true);
    setErr(null);
    try {
      const label = /iPad/i.test(navigator.userAgent) ? "iPad" : /iPhone/i.test(navigator.userAgent) ? "iPhone" : "Phone";
      const res = await fetch("/api/tokens", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: `${label}, ${new Date().toLocaleDateString()}` }),
      });
      const json = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !json.token) throw new Error(json.error ?? "Could not make a key.");
      setToken(json.token);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* the field is selectable */ }
  }

  if (!token) {
    return (
      <div style={{ marginTop: 10 }}>
        <button type="button" className="btn solid" onClick={() => void make()} disabled={busy}>{busy ? "Making it..." : "Make my key"}</button>
        {err && <p className="hint" style={{ color: "var(--warn)" }}>{err}</p>}
      </div>
    );
  }
  return (
    <div className="keybox">
      <input readOnly value={`Bearer ${token}`} onFocus={(e) => e.currentTarget.select()} aria-label="Your key" />
      <button type="button" className="btn solid" onClick={() => void copy(`Bearer ${token}`)}>{copied ? "Copied" : "Copy"}</button>
      <p className="hint">Shown once. It is copied with the word Bearer in front, ready to paste as the header value.</p>
    </div>
  );
}
