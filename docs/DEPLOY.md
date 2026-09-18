# Deploying Palette

One always-on container, a Postgres next to it, images in Cloudflare R2, Google sign-in.
About $5 to $10 a month before AI tagging. Every credential is created and pasted by Trevor;
no agent ever sees one.

## Why a container and not Vercel

The first version of this guide said Vercel. Three facts about the app as built rule it out:

- **Vercel caps a request body at 4.5MB.** A phone photo is 3 to 12MB. Most captures would fail.
- **The image model (CLIP) needs a disk and a warm process.** Serverless has neither, so
  "search by what it looks like" would be off for the team.
- **The tag queue wants a worker that is always there.** Vercel's Hobby plan allows one cron a
  day and rejects a deployment that asks for more.

A small container has none of these limits. Railway is the simplest host for one: it builds
the `Dockerfile` in this repo straight from GitHub. Fly.io, Render, or the Proxmox box behind a
Cloudflare Tunnel work the same way with the same variables.

| Piece | Service | Why |
|---|---|---|
| App | Railway, from the `Dockerfile` | No upload cap, runs CLIP in-process, runs its own tag worker |
| Database | Railway Postgres, same project | One click, `DATABASE_URL` wired for you, same schema as local |
| Images | Cloudflare R2, private bucket | No egress fees, and the bytes are not tied to the app host |
| Sign-in | Google OAuth client | Restricted to `@hauscustomhomes.com` |

Nothing needs to be run against the database. On first boot the app applies the schema and its
enforcement triggers, refuses to start if any trigger is missing, and seeds the vocabulary.

---

## Step 1. Cloudflare R2 (the images)

1. https://dash.cloudflare.com, sign up or sign in. **R2 Object Storage** in the sidebar. The
   first time, it asks for a payment method; the free tier covers 10GB and there are no egress
   fees.
2. **Create bucket**. Name `palette`. Location automatic. Create. Leave public access **off**.
3. Back on the R2 overview, **Manage API tokens** (or **API**, **Manage API tokens**),
   **Create API token**: permission **Object Read & Write**, scope **Apply to specific buckets
   only**, choose `palette`. Create.
4. Copy three things into a note you will delete afterwards:
   - **Access Key ID**
   - **Secret Access Key** (shown once)
   - your **Account ID** (on the R2 overview page, right side)

## Step 2. Google sign-in

1. https://console.cloud.google.com, signed in as a Workspace admin. Create a project named
   `Palette` (top bar, project picker, **New project**).
2. **APIs & Services**, **OAuth consent screen**. User type **Internal**. App name `Palette`,
   support email yours. Save. Internal is what limits sign-in to your Workspace; Palette checks
   the domain again regardless.
3. **APIs & Services**, **Credentials**, **Create credentials**, **OAuth client ID**.
   Application type **Web application**. Name `Palette web`.
4. Leave **Authorised redirect URIs** empty for the moment; you need the Railway address from
   step 3 first. Create, then copy the **Client ID** and **Client secret** into your note.

## Step 3. Railway (the app and its database)

1. https://railway.com, **Login with GitHub**. Choose the **Hobby** plan ($5 a month).
2. **New Project**, **Deploy from GitHub repo**, pick `HAUS-Custom-Homes/Palette`. If it is not
   listed, **Configure GitHub App** and grant Railway access to that repo. Railway finds the
   `Dockerfile` and starts building. The first build fails or idles without its variables;
   that is expected.
3. In the project canvas, **Create** (or **+ New**), **Database**, **Add PostgreSQL**.
4. Click the **Palette** service, **Variables**, **New Variable**, and add these. For
   `DATABASE_URL` use **Add Reference** and pick the Postgres service's `DATABASE_URL`, so it
   follows the database automatically.

   ```
   DATABASE_URL            reference to Postgres.DATABASE_URL
   PALETTE_STORE_DRIVER    r2
   R2_ACCOUNT_ID           from step 1
   R2_ACCESS_KEY_ID        from step 1
   R2_SECRET_ACCESS_KEY    from step 1
   R2_BUCKET               palette
   AUTH_GOOGLE_ID          from step 2
   AUTH_GOOGLE_SECRET      from step 2
   AUTH_SECRET             a long random string, see below
   PALETTE_ALLOWED_DOMAIN  hauscustomhomes.com
   ANTHROPIC_API_KEY       optional now; without it tags are filename guesses
   ```

   For `AUTH_SECRET`, in PowerShell on your own machine:

   ```powershell
   $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
   ```

   Do **not** add `PALETTE_DEV_AUTH`. It is ignored in production in any case.
5. **Settings**, **Networking**, **Generate Domain**. You get
   `https://palette-production-xxxx.up.railway.app`. If it asks for a port, `3200`.
6. **Settings**, **Volumes** (or right-click the service, **Attach volume**): mount path
   `/data`, 2GB. This keeps the 350MB image model across redeploys.
7. **Settings**, **Deploy**, **Healthcheck Path**: `/api/healthz`.
8. **Deployments**, **Redeploy**. Watch the logs for `[boot] empty database: seeded 8 facets,
   129 terms` and `[boot] tag worker started`.

## Step 4. Tell Google the address

Back in Google Cloud, **Credentials**, your `Palette web` client, **Authorised redirect URIs**,
add exactly:

```
https://YOUR-RAILWAY-DOMAIN/api/auth/callback/google
```

Save. It can take a few minutes to apply.

## Step 5. First sign-in

Open `https://YOUR-RAILWAY-DOMAIN`. Sign in with Google. **The first person to sign in becomes
owner**, so do this yourself before sharing the address. Everyone after is an editor; change
roles on the **People** page.

## Step 6. Prove it

On the site: drop an image on the library page. It should appear, then gain tags within a minute
or so. The first image also triggers the one-time model download, so give search a few minutes
before judging it.

From your laptop, prove the bytes in R2 are intact, with the same variables in your shell:

```bash
npm run verify -- --full
```

A library that cannot pass this has not met FR-11. Run it after the first real imports and
monthly after that (FR-40).

## Step 7. The team

1. Send the address. They sign in with their Workspace Google account.
2. Each person: **Phone and settings**, make a token per phone, follow `docs/SHORTCUT.md`
   (iPhone) or just **Add to Home screen** (Android).
3. Desktop people: load the extension (`extension/README.md`), host and token in its settings.

## A custom address (optional)

Railway, **Settings**, **Networking**, **Custom Domain**, enter `palette.hauscustomhomes.com`,
add the CNAME it shows at your DNS host. Then add the matching redirect URI in Google
(step 4) with the new domain. HTTPS is automatic.

## Moving the local library up

With the production variables in your shell (copy them from Railway; `DATABASE_URL` needs the
**public** connection string from the Postgres service's **Connect** tab):

```bash
npm run import -- ./data/store/originals --recursive --as trevor@hauscustomhomes.com
```

Imports are idempotent by hash, so running it twice adds nothing.

## Costs to expect

Railway Hobby is $5 a month and includes $5 of usage; this app idles around 300 to 500MB of RAM,
which lands near or a little over that. R2 is free to 10GB, then about $0.015 per GB a month.
AI tagging is the variable and is reported per run and on `/api/health`.

## Backups (FR-14, FR-15)

Railway Postgres has its own backups on paid plans; do not rely on them alone. From any machine
with the variables set:

```bash
PALETTE_BACKUP_DIR=D:/backups/palette npm run backup
PALETTE_MIRROR_DIR=//192.168.1.125/share/palette/originals npm run mirror
```

## If you still want Vercel

It works only with `PALETTE_EMBEDDINGS=off`, only for images under 4.5MB unless uploads are
rebuilt to go direct to R2, and the cron in `vercel.json` is daily because Hobby rejects
anything more frequent. Not recommended for this app.

## When the library passes roughly 50,000 images

Add pgvector: `CREATE EXTENSION vector;`, a `vector(512)` column populated from
`embeddings.vector`, an HNSW index, and point `src/search/vectors.ts` at it. Everything above
that file stays the same.

## Not yet exercised

The R2 driver (`src/storage/r2.ts`) and the `Dockerfile` were written on a machine with no
Docker and no bucket. The production build and a production-mode start are verified locally;
the first Railway build and the first `npm run verify -- --full` against R2 are the real tests.
If the build fails, the log will say why and it is a one-line fix.
