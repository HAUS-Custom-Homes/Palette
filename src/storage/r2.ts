import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "@/config";
import type { ObjectStore } from "./object-store";

/**
 * REF-01 FR-13. Cloudflare R2 through the S3 API.
 *
 * Chosen over an egress-billed store because the library is read-heavy and
 * serves images to browsers, which is exactly the shape that makes egress the
 * dominant cost elsewhere. R2 charges none.
 *
 * The bucket is private. Browsers reach objects only through url(), which
 * signs a short-lived GET; the bucket itself is never public (NFR-7).
 *
 * Not yet exercised against a real bucket from this machine. The key layout,
 * the never-overwrite rule and the listing walk are shared with the local
 * driver and tested there.
 */
export class R2ObjectStore implements ObjectStore {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const { accountId, accessKeyId, secretAccessKey, bucket } = config.r2;
    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error("R2 driver selected but R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are not all set");
    }
    this.bucket = bucket;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    // Content-addressed: if the key exists, the bytes are by definition the
    // same, so the write is skipped rather than repeated.
    if (await this.has(key)) return;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Immutable by construction; let every cache in the path know.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`empty body for ${key}`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async has(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      if ((err as { name?: string }).name === "NotFound") return false;
      if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false;
      throw err;
    }
  }

  async size(key: string): Promise<number> {
    const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    return res.ContentLength ?? 0;
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const o of res.Contents ?? []) if (o.Key) keys.push(o.Key);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async url(key: string): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: config.r2.signedUrlTtl,
    });
  }
}
