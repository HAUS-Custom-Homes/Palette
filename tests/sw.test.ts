import fs from "node:fs";
import path from "node:path";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * REF-01 FR-8. Runs the real public/sw.js, unmodified, against a fake
 * IndexedDB and a network that can be switched off and on. A service worker
 * cannot be registered in the embedded browser pane or under vitest, so this
 * is where "a capture made with no signal is never lost" is proven.
 */
type Listener = (event: Record<string, unknown>) => void;

function loadWorker(net: { fetch: (req: Request | string, init?: RequestInit) => Promise<Response> }) {
  const listeners = new Map<string, Listener>();
  const messages: unknown[] = [];
  const syncs: string[] = [];
  const store = new Map<string, Response>();
  const self = {
    location: { origin: "https://palette.test" },
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    skipWaiting: () => {},
    clients: { claim: async () => {}, matchAll: async () => [{ postMessage: (m: unknown) => messages.push(m) }] },
    registration: { sync: { register: async (tag: string) => void syncs.push(tag) } },
  };
  const caches = {
    open: async () => ({
      addAll: async () => {},
      put: async (k: string, v: Response) => void store.set(k, v),
      match: async (k: string) => store.get(k),
    }),
    keys: async () => [],
    delete: async () => true,
  };
  const src = fs.readFileSync(path.resolve("public/sw.js"), "utf8");
  new Function("self", "caches", "indexedDB", "fetch", src)(self, caches, new IDBFactory(), (r: Request | string, i?: RequestInit) => net.fetch(r, i));

  /** Dispatch a fetch event and return what the worker responded with. */
  const dispatchFetch = async (request: Request): Promise<Response | undefined> => {
    let responded: Promise<Response> | undefined;
    listeners.get("fetch")!({ request, respondWith: (p: Promise<Response>) => (responded = Promise.resolve(p)) });
    return responded;
  };
  /** Send the worker a message and wait for its reply on the port. */
  const ask = (type: string) =>
    new Promise<Record<string, unknown>>((resolve) => {
      let work: Promise<unknown> = Promise.resolve();
      listeners.get("message")!({ data: { type }, ports: [{ postMessage: resolve }], waitUntil: (p: Promise<unknown>) => (work = p) });
      void work;
    });
  const sync = async () => {
    let work: Promise<unknown> = Promise.resolve();
    listeners.get("sync")!({ tag: "palette-flush", waitUntil: (p: Promise<unknown>) => (work = p) });
    await work;
  };
  return { dispatchFetch, ask, sync, messages, syncs };
}

const photo = (name: string, bytes = 2048) => new File([new Uint8Array(bytes).fill(7)], name, { type: "image/jpeg" });

function capture(files: File[], fields: Record<string, string> = {}, pathName = "/api/ingest") {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new Request(`https://palette.test${pathName}`, { method: "POST", body: fd });
}

let online: boolean;
let serverStatus: number;
let received: Array<{ files: Array<{ name: string; size: number }>; fields: Record<string, string> }>;
const net = {
  async fetch(req: Request | string, init?: RequestInit): Promise<Response> {
    if (!online) throw new TypeError("Failed to fetch");
    const body = (typeof req === "string" ? init?.body : await req.formData()) as FormData;
    const files: Array<{ name: string; size: number }> = [];
    const fields: Record<string, string> = {};
    for (const [k, v] of body.entries()) typeof v === "string" ? (fields[k] = v) : files.push({ name: v.name, size: v.size });
    if (serverStatus === 200) received.push({ files, fields });
    return new Response(JSON.stringify({ saved: files.length }), { status: serverStatus, headers: { "content-type": "application/json" } });
  },
};

beforeEach(() => { online = true; serverStatus = 200; received = []; });

describe("FR-8 offline capture", () => {
  it("online, the worker is invisible: the request goes straight through", async () => {
    const w = loadWorker(net);
    const res = await w.dispatchFetch(capture([photo("a.jpg")]));
    expect(res!.status).toBe(200);
    expect(received).toHaveLength(1);
    expect((await w.ask("count")).pending).toBe(0);
  });

  it("offline, the photo is kept on the phone with its haus and note, and the person is told so", async () => {
    const w = loadWorker(net);
    online = false;
    const res = await w.dispatchFetch(capture([photo("site.jpg", 5000), photo("detail.jpg", 3000)], { haus: "hurst", note: "stair rail" }));
    expect(res!.status).toBe(202);
    expect(await res!.json()).toMatchObject({ queued: true, pending: 1 });
    expect(w.syncs).toContain("palette-flush"); // asked the OS to wake us when signal returns
    expect(w.messages).toContainEqual({ type: "queued", pending: 1 });
    expect(received).toHaveLength(0);
  });

  it("when signal returns the queue drains, bytes and fields intact, and empties", async () => {
    const w = loadWorker(net);
    online = false;
    await w.dispatchFetch(capture([photo("site.jpg", 5000), photo("detail.jpg", 3000)], { haus: "hurst", note: "stair rail" }));
    await w.dispatchFetch(capture([photo("third.jpg", 1000)]));
    expect((await w.ask("count")).pending).toBe(2);

    online = true;
    await w.sync(); // what Android does by itself
    expect(received).toHaveLength(2);
    expect(received[0].files).toEqual([{ name: "site.jpg", size: 5000 }, { name: "detail.jpg", size: 3000 }]);
    expect(received[0].fields).toMatchObject({ haus: "hurst", note: "stair rail" });
    expect((await w.ask("count")).pending).toBe(0);
    expect(w.messages).toContainEqual({ type: "flushed", sent: 2, pending: 0, stopped: null });
  });

  it("a flush that is still offline loses nothing and can be retried", async () => {
    const w = loadWorker(net);
    online = false;
    await w.dispatchFetch(capture([photo("a.jpg")]));
    expect(await w.ask("flush")).toMatchObject({ sent: 0, pending: 1, stopped: "offline" });
    online = true;
    expect(await w.ask("flush")).toMatchObject({ sent: 1, pending: 0 });
  });

  it("an expired session keeps everything and says sign in; a server error keeps it too", async () => {
    const w = loadWorker(net);
    online = false;
    await w.dispatchFetch(capture([photo("a.jpg")]));
    online = true;
    serverStatus = 401;
    expect(await w.ask("flush")).toMatchObject({ sent: 0, pending: 1, stopped: "signin" });
    serverStatus = 500;
    expect(await w.ask("flush")).toMatchObject({ sent: 0, pending: 1, stopped: "server" });
    serverStatus = 200;
    expect(await w.ask("flush")).toMatchObject({ sent: 1, pending: 0 });
  });

  it("something the server will never accept is dropped rather than retried forever", async () => {
    const w = loadWorker(net);
    online = false;
    await w.dispatchFetch(capture([photo("broken.jpg")]));
    online = true;
    serverStatus = 422;
    expect(await w.ask("flush")).toMatchObject({ sent: 0, pending: 0 });
  });

  it("the Android share sheet offline: a shared link in `text` is queued as a url and the person lands on Capture", async () => {
    const w = loadWorker(net);
    online = false;
    const res = await w.dispatchFetch(capture([], { title: "Kitchen idea", text: "Look at this https://www.instagram.com/p/CxYz_12/ wow" }, "/share"));
    expect(res!.status).toBe(303);
    expect(res!.headers.get("location")).toBe("https://palette.test/capture?queued=1");
    online = true;
    await w.sync();
    expect(received[0].fields).toMatchObject({ url: "https://www.instagram.com/p/CxYz_12/", note: "Kitchen idea" });
  });

  it("leaves everything that is not a capture alone", async () => {
    const w = loadWorker(net);
    expect(await w.dispatchFetch(new Request("https://palette.test/api/items?q=x"))).toBeUndefined();
    expect(await w.dispatchFetch(new Request("https://other.test/api/ingest", { method: "POST", body: "x" }))).toBeUndefined();
  });
});
