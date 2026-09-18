import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp is native, PGlite loads WASM by file path, postgres-js opens sockets.
  // All three must stay external to the server bundle: bundled, PGlite's
  // `new URL(..., import.meta.url)` reaches fs.readFile as a URL object and
  // every database call fails with "path argument must be of type string".
  serverExternalPackages: ["sharp", "@electric-sql/pglite", "postgres", "@huggingface/transformers", "onnxruntime-node"],
  // migrate() reads drizzle/*.sql at runtime with fs. Next only ships files it
  // can see being imported, so without this a traced deployment (Vercel,
  // standalone) boots and immediately fails with ENOENT on the schema.
  outputFileTracingIncludes: { "/**": ["./drizzle/**"] },
  experimental: {
    serverActions: {
      // Folder imports and multi-file drops push large multipart bodies.
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
