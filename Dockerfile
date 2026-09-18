# Palette, as one always-on container (Railway, Fly, Render, or the Proxmox box).
#
# Why a container and not serverless: phone photos exceed Vercel's 4.5MB
# request cap, the CLIP model needs a disk and a warm process, and the tag
# queue wants a worker that is always there. See docs/DEPLOY.md.
#
# Debian slim, not Alpine: sharp and onnxruntime-node ship glibc binaries.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    # /data is the mounted volume: the CLIP weights cache there so a redeploy
    # does not download 350MB again. Images live in R2, rows in Postgres.
    PALETTE_DATA_DIR=/data \
    PALETTE_MODEL_DIR=/data/models \
    PALETTE_EMBEDDINGS=clip \
    # An always-on process can run its own tag worker (src/lib/boot.ts).
    PALETTE_WORKER=1
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json /app/next.config.ts ./
RUN mkdir -p /data
EXPOSE 3200
# Railway and friends inject PORT. 0.0.0.0 so the platform's proxy can reach it.
CMD ["sh", "-c", "npx next start -H 0.0.0.0 -p ${PORT:-3200}"]
