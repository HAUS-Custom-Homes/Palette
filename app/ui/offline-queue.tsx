"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * REF-01 FR-8. Registers the service worker and shows what is waiting on
 * this phone. The queue itself lives in the worker (public/sw.js); this is
 * only its face: a pill while anything is pending, a nudge to sign in if the
 * session lapsed, and a refresh when uploads land.
 */
type Reply = { pending?: number; sent?: number; stopped?: string | null };

function ask(type: "count" | "flush"): Promise<Reply> {
  return new Promise((resolve) => {
    const sw = navigator.serviceWorker?.controller;
    if (!sw) return resolve({});
    const ch = new MessageChannel();
    const timer = setTimeout(() => resolve({}), 8000);
    ch.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data as Reply); };
    sw.postMessage({ type }, [ch.port2]);
  });
}

export function OfflineQueue() {
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  const flush = useCallback(async () => {
    const r = await ask("flush");
    if (typeof r.pending === "number") setPending(r.pending);
    if (r.sent) { setNote(`${r.sent} uploaded from this phone`); router.refresh(); }
    if (r.stopped === "signin") setNote("Sign in to upload what is waiting on this phone");
  }, [router]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    setOnline(navigator.onLine);
    navigator.serviceWorker.register("/sw.js").then(async () => {
      await navigator.serviceWorker.ready;
      const r = await ask("count");
      if (typeof r.pending === "number") { setPending(r.pending); if (r.pending > 0 && navigator.onLine) void flush(); }
    }).catch(() => {});

    const onMsg = (e: MessageEvent) => {
      const d = e.data as Reply & { type?: string };
      if (typeof d.pending === "number") setPending(d.pending);
      if (d.type === "flushed" && d.sent) { setNote(`${d.sent} uploaded from this phone`); router.refresh(); }
      if (d.type === "flushed" && d.stopped === "signin") setNote("Sign in to upload what is waiting on this phone");
    };
    const goOnline = () => { setOnline(true); void flush(); };
    const goOffline = () => setOnline(false);
    navigator.serviceWorker.addEventListener("message", onMsg);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMsg);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [flush, router]);

  if (pending === 0 && online && !note) return null;

  return (
    <div className="offline-pill" data-online={online} role="status">
      {!online && <span>No signal. </span>}
      {pending > 0 ? (
        <>
          <b>{pending}</b> saved on this phone, waiting to upload.
          {online && <button type="button" onClick={() => void flush()}>Upload now</button>}
        </>
      ) : note ? (
        <>{note} <button type="button" onClick={() => setNote(null)}>OK</button></>
      ) : (
        <>You can still save photos; they will upload later.</>
      )}
    </div>
  );
}
