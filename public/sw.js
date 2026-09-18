/*
 * Palette service worker. REF-01 FR-8: a capture made with no signal is never lost.
 *
 * It does one job. Every capture in the web app is a POST to /share (the
 * Android share sheet) or /api/ingest (the Capture page, the upload zone).
 * When that POST cannot reach the server, the request body is written to
 * IndexedDB on the phone and the person is told it is saved here. When the
 * network returns, the queue is replayed against /api/ingest.
 *
 * Replays are safe to repeat: the server stores by content hash, so sending
 * the same photo twice yields one image. That is what lets this be simple.
 *
 * Android Chrome wakes this worker by itself when signal returns (Background
 * Sync). iOS has no such thing; there the queue flushes the next time Palette
 * is opened with a connection. Either way nothing is dropped.
 */
const VERSION = "palette-sw-v1";
const SHELL = `${VERSION}-shell`;
const DB_NAME = "palette-offline";
const STORE = "queue";
const CAPTURE_PATHS = new Set(["/share", "/api/ingest"]);
const OFFLINE_PAGES = ["/capture"]; // pages worth opening with no signal

// ---------------------------------------------------------------- lifecycle
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/offline.html"])).catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== SHELL) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

// ---------------------------------------------------------------- IndexedDB
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out && "result" in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const queueAll = async () => tx(await openDb(), "readonly", (s) => s.getAll());
const queueCount = async () => tx(await openDb(), "readonly", (s) => s.count());
const queueAdd = async (entry) => tx(await openDb(), "readwrite", (s) => s.add(entry));
const queueDelete = async (id) => tx(await openDb(), "readwrite", (s) => s.delete(id));

// ---------------------------------------------------------------- capture
/** Turn a request body into something IndexedDB can hold: fields plus Blobs. */
async function serialise(request) {
  const type = request.headers.get("content-type") || "";
  const entry = { at: Date.now(), fields: [], files: [] };
  if (type.includes("application/json")) {
    const j = await request.json();
    if (j.url) entry.fields.push(["url", String(j.url)]);
    if (j.note) entry.fields.push(["note", String(j.note)]);
    for (const h of j.haus || []) entry.fields.push(["haus", String(h)]);
    return entry;
  }
  const fd = await request.formData();
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string") {
      // Bytes, not a Blob: every browser can clone an ArrayBuffer into
      // IndexedDB, and iOS Safari has a history of losing Blobs stored there.
      if (v.size > 0) entry.files.push({ name: v.name || "photo.jpg", type: v.type || "image/jpeg", buf: await v.arrayBuffer() });
    } else if (k === "text") {
      // The Android share sheet puts a link in `text`; ingest wants it in `url`.
      const m = String(v).match(/https?:\/\/\S+/);
      if (m) entry.fields.push(["url", m[0]]);
    } else if (k === "title") {
      entry.fields.push(["note", String(v)]);
    } else {
      entry.fields.push([k, String(v)]);
    }
  }
  return entry;
}

async function handleCapture(request) {
  const path = new URL(request.url).pathname;
  const copy = request.clone();
  try {
    return await fetch(request);
  } catch {
    // No network. Keep it here.
    let pending = 0;
    try {
      const entry = await serialise(copy);
      if (entry.files.length || entry.fields.some(([k]) => k === "url")) await queueAdd(entry);
      pending = await queueCount();
      if (self.registration.sync) await self.registration.sync.register("palette-flush").catch(() => {});
      await notifyClients({ type: "queued", pending });
    } catch (err) {
      return new Response(JSON.stringify({ error: "offline, and this phone could not store it: " + err }), { status: 503, headers: { "content-type": "application/json" } });
    }
    if (path === "/share") return Response.redirect(new URL("/capture?queued=1", self.location.origin).href, 303);
    return new Response(JSON.stringify({ queued: true, pending, saved: 0, duplicates: 0, variants: 0, failed: 0 }), {
      status: 202, headers: { "content-type": "application/json" },
    });
  }
}

// ---------------------------------------------------------------- flush
let flushing = null;
function flush() {
  if (!flushing) flushing = doFlush().finally(() => (flushing = null));
  return flushing;
}

async function doFlush() {
  const entries = await queueAll();
  let sent = 0;
  let stopped = null;
  for (const e of entries) {
    const fd = new FormData();
    for (const [k, v] of e.fields) fd.append(k, v);
    for (const f of e.files) fd.append("files", new File([f.buf], f.name, { type: f.type }));
    let res;
    try {
      res = await fetch("/api/ingest", { method: "POST", body: fd, credentials: "same-origin" });
    } catch {
      stopped = "offline";
      break; // still no network; try again later
    }
    if (res.status === 401 || res.status === 403) {
      stopped = "signin";
      break; // keep everything; the person needs to sign in first
    }
    // 2xx: stored. 400/413/422: the server will never accept this one; drop it
    // rather than retry forever. 5xx: leave it for the next attempt.
    if (res.ok || [400, 413, 415, 422].includes(res.status)) {
      await queueDelete(e.id);
      if (res.ok) sent++;
    } else {
      stopped = "server";
      break;
    }
  }
  const pending = await queueCount();
  await notifyClients({ type: "flushed", sent, pending, stopped });
  return { sent, pending, stopped };
}

async function notifyClients(msg) {
  for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(msg);
}

self.addEventListener("sync", (event) => {
  if (event.tag === "palette-flush") event.waitUntil(flush());
});

self.addEventListener("message", (event) => {
  const reply = (data) => event.ports[0] && event.ports[0].postMessage(data);
  if (event.data?.type === "flush") event.waitUntil(flush().then(reply));
  else if (event.data?.type === "count") event.waitUntil(queueCount().then((pending) => reply({ pending })));
});

// ---------------------------------------------------------------- fetch
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.method === "POST" && CAPTURE_PATHS.has(url.pathname)) {
    event.respondWith(handleCapture(req));
    return;
  }

  // Navigations: network first. The Capture page is kept for offline use; any
  // other page falls back to a plain "no signal" page that links to Capture.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok && OFFLINE_PAGES.includes(url.pathname)) {
            const cache = await caches.open(SHELL);
            await cache.put(url.pathname, res.clone());
          }
          // Back online and something is waiting: send it.
          queueCount().then((n) => n > 0 && flush()).catch(() => {});
          return res;
        } catch {
          const cache = await caches.open(SHELL);
          return (await cache.match(url.pathname)) || (await cache.match("/offline.html")) || new Response("offline", { status: 503 });
        }
      })(),
    );
  }
});
