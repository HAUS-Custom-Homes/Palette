import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/config";

/**
 * REF-01 FR-11, FR-13, NFR-13.
 *
 * The app never touches a filesystem path or a bucket name. It speaks to this
 * interface. Two drivers: the local filesystem for development, Cloudflare R2
 * (src/storage/r2.ts) for production. Same seven methods.
 */
export interface ObjectStore {
  /** Writes bytes at an exact key. Never overwrites (FR-11). */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  has(key: string): Promise<boolean>;
  size(key: string): Promise<number>;
  /** Everything under a prefix. Used by the integrity scrub (FR-40). */
  list(prefix: string): Promise<string[]>;
  /** Only ever called by the explicitly confirmed hard delete (FR-43). */
  delete(key: string): Promise<void>;
  /**
   * A short-lived URL a browser can fetch directly, or null when the store
   * has no such thing and the app must stream the bytes itself (NFR-7).
   */
  url(key: string): Promise<string | null>;
}

export function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * FR-11. The hash is the identity. Fanning out two levels keeps any one
 * directory, or one bucket listing, small at 100,000 objects (NFR-2).
 */
export function originalKey(hash: string, ext: string): string {
  const clean = ext.replace(/^\.+/, "").toLowerCase() || "bin";
  return `originals/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.${clean}`;
}

/** FR-12. Derivatives are disposable and rebuildable from the original. */
export function derivedKey(hash: string, variant: string): string {
  return `derived/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}/${variant}.webp`;
}

export class LocalObjectStore implements ObjectStore {
  constructor(private root: string = config.storeDir) {}

  private abs(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root))) {
      throw new Error(`object key escapes store root: ${key}`);
    }
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const full = this.abs(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    try {
      // wx: fail if it exists. Content-addressed writes are never overwrites.
      await fs.writeFile(full, body, { flag: "wx" });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") return;
      throw err;
    }
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.abs(key));
  }

  async has(key: string): Promise<boolean> {
    try {
      await fs.access(this.abs(key));
      return true;
    } catch {
      return false;
    }
  }

  async size(key: string): Promise<number> {
    return (await fs.stat(this.abs(key))).size;
  }

  async list(prefix: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string) => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else out.push(path.relative(this.root, full).split(path.sep).join("/"));
      }
    };
    await walk(this.abs(prefix));
    return out;
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.abs(key), { force: true });
  }

  async url(): Promise<null> {
    return null;
  }
}

let _store: ObjectStore | null = null;

export function store(): ObjectStore {
  if (_store) return _store;
  if (config.storeDriver === "r2") {
    // Lazy so the S3 SDK is only loaded when R2 is actually configured.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { R2ObjectStore } = require("./r2") as typeof import("./r2");
    _store = new R2ObjectStore();
  } else {
    _store = new LocalObjectStore();
  }
  return _store;
}
