# Palette on your own hardware

The alternative to `docs/DEPLOY.md`: the app, the database and every image on the Proxmox box,
reached from anywhere over HTTPS through a free Cloudflare Tunnel. No monthly hosting bill.
Same container, same code, one setting different (`PALETTE_STORE_DRIVER=local`).

## The short way

On the Proxmox host, as root:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/HAUS-Custom-Homes/Palette/main/tools/provision-proxmox.sh)
```

It creates an LXC named `palette` (same shape as the walkmyhaus and pipeline containers),
installs Docker and cloudflared, clones the repo, generates the database password and
`AUTH_SECRET` inside the container without printing them, builds, starts, and waits for
`/api/healthz`. It then prints the two steps that need you to sign in: `cloudflared tunnel login`
followed by `tools/tunnel-setup.sh`, and the Google client. Safe to run twice. The rest of this
page is the long way and the reasoning.

## What you trade

| | Railway + R2 | Your own box |
|---|---|---|
| Monthly | about $10 to $15 | $0, plus a little electricity |
| Who owns the bytes | You, in Cloudflare's building | You, in your building |
| Who is the ops team | Railway | You: updates, disks, backups |
| When the office internet or power is out | Library still up | Library down for everyone |
| Speed for a phone on a job site | Data-centre fast | Your office **upload** speed |
| Offsite copy | Inherent | **You must make one**, or a fire or a dead disk ends the library |

The last row is the one that matters. REF-01's first pillar is permanence, and a single box in
one building is not permanent. Self-hosting is a fine choice **with** an offsite copy and a
poor one without. The R2 bucket you already made is that copy: a few dollars a month at
hundreds of gigabytes, and free under 10GB.

## What you need

- A Proxmox **VM or LXC** with Docker (Debian 12 or 13, 2 vCPU, **4GB RAM**, since the image
  model holds about 600MB). For an LXC, enable *nesting* and *keyctl* under Options, Features.
- A disk or dataset for the library. Plan on 5MB per image. A ZFS mirror is worth it.
- `hauscustomhomes.com` (or any domain) with its **DNS on Cloudflare**, so a tunnel can have a
  real hostname like `palette.hauscustomhomes.com`. If the company domain's DNS lives elsewhere
  and you would rather not move it, a separate $10 a year domain on Cloudflare works the same.

## Steps

### 1. The tunnel (Cloudflare dashboard, 5 minutes)

**Zero Trust**, **Networks**, **Tunnels**, **Create a tunnel**, type **Cloudflared**, name
`palette`. Copy the **token** it shows (the long string after `--token`). Under **Public
Hostname**, add `palette.hauscustomhomes.com`, service **HTTP**, URL `app:3200`. Save.

No ports are opened on your router. The tunnel dials out.

### 2. On the box

```bash
git clone https://github.com/HAUS-Custom-Homes/Palette.git /opt/palette
cd /opt/palette
nano .env.production
```

`.env.production` (this file is gitignored; it never leaves the box):

```
POSTGRES_PASSWORD=        # any long random string
TUNNEL_TOKEN=             # from step 1
PALETTE_LIBRARY_DIR=/srv/palette/library    # where the images live

AUTH_GOOGLE_ID=           # the same Google client as docs/DEPLOY.md step 2
AUTH_GOOGLE_SECRET=
AUTH_SECRET=              # openssl rand -base64 32
PALETTE_ALLOWED_DOMAIN=hauscustomhomes.com
ANTHROPIC_API_KEY=        # optional; without it tags are filename guesses
```

```bash
docker compose --env-file .env.production up -d --build
docker compose logs -f app     # look for: seeded 8 facets, 129 terms / tag worker started
```

### 3. Google

In the Google client, **Authorised redirect URIs**, add
`https://palette.hauscustomhomes.com/api/auth/callback/google`.

### 4. Sign in first

Open the address. The first person to sign in becomes owner.

## The offsite copy (do not skip)

Nightly, from the box's crontab. `rclone config` once, with the R2 keys, as a remote named `r2`.

```bash
# the database
docker compose -f /opt/palette/docker-compose.yml exec -T db pg_dump -U palette palette \
  | gzip > /srv/palette/backups/palette-$(date +\%F).sql.gz
# the images: originals only; derivatives and the model are rebuildable
rclone sync /srv/palette/library/store/originals r2:palette/originals --checksum
rclone copy /srv/palette/backups r2:palette/db --max-age 48h
```

Originals are immutable and named by their own hash, so this sync only ever adds files and a
corrupted local file can never overwrite a good remote one silently: `--checksum` flags it.

Once a quarter, prove it: restore one day's dump into a scratch database and pull ten random
originals back from R2, then run `npm run verify` against them (REF-01 FR-41). A backup that has
never been restored is not a backup.

## Updating

```bash
cd /opt/palette && git pull && docker compose --env-file .env.production up -d --build
```

The schema migrates itself on boot and refuses to start if an enforcement trigger is missing.

## Moving between the two

Both directions are an import, because imports are idempotent by content hash. From Railway to
the box: `npm run export` there, `npm run import` here. Nothing about choosing one now locks
you in.

## Not yet exercised

This compose file was written on a machine without Docker. The image itself is proven (Railway
built and ran it first try); the compose wiring is straightforward but untested until the first
`docker compose up`.
