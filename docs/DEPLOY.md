# Deploying Palette

Four accounts, all created by Trevor, credentials entered by Trevor into Vercel. No agent ever
sees them. Rough monthly cost for a team of ten: low tens of dollars before AI tagging.

| Piece | Service | Why |
|---|---|---|
| App | Vercel | Matches HAUS practice. `after()` and Cron run the tagger. |
| Database | Neon (or Vercel Postgres) | Hosted Postgres 17. Same schema as local PGlite. |
| Images | Cloudflare R2 | Private bucket, no egress fees. The library is read-heavy. |
| Sign-in | Google Cloud OAuth client | Restricted to `@hauscustomhomes.com`. |

## 1. Database

Create a Neon project. Copy the connection string. Then, from this repo:

```bash
DATABASE_URL='postgres://...' npm run migrate
DATABASE_URL='postgres://...' npm run seed
```

`migrate` applies `drizzle/0000_init.sql` and `drizzle/triggers.sql` and refuses to finish if
any of the four enforcement triggers is missing. `seed` loads the vocabulary. Both are safe to
re-run.

## 2. R2

Cloudflare dashboard, R2, create bucket `palette`. Leave it **private**. Create an API token
with Object Read and Write on that bucket. Note the account id, access key id and secret.

## 3. Google sign-in

Google Cloud console, a project for HAUS, **APIs and Services, Credentials, Create OAuth client**,
type **Web application**. Authorised redirect URIs:

```
https://YOUR-HOST/api/auth/callback/google
http://localhost:3200/api/auth/callback/google
```

Under **OAuth consent screen**, set user type **Internal**. That alone limits sign-in to the
Workspace; Palette checks the domain again on every sign-in regardless.

## 4. Vercel

Import the repo. Framework Next.js. Set these environment variables:

```
DATABASE_URL            from step 1
PALETTE_STORE_DRIVER     r2
R2_ACCOUNT_ID           from step 2
R2_ACCESS_KEY_ID        from step 2
R2_SECRET_ACCESS_KEY    from step 2
R2_BUCKET               palette
AUTH_GOOGLE_ID          from step 3
AUTH_GOOGLE_SECRET      from step 3
AUTH_SECRET             openssl rand -base64 32
PALETTE_ALLOWED_DOMAIN   hauscustomhomes.com
CRON_SECRET             openssl rand -base64 32
ANTHROPIC_API_KEY       for real tagging; leave unset to run the heuristic tagger
PALETTE_TAG_MODEL        claude-opus-5
```

Do **not** set `PALETTE_DEV_AUTH` in Vercel. It is ignored in production anyway.

`vercel.json` schedules `/api/cron/tag` every five minutes. On the Hobby plan Vercel limits
crons to once a day; `after()` in the ingest route still tags on every upload, so the cron is a
safety net rather than the mechanism. Pro removes the limit.

## 5. First sign-in

The first person to sign in becomes **owner**. Everyone after is **editor**. Sign in first.

## 6. Prove it

```bash
DATABASE_URL='postgres://...' PALETTE_STORE_DRIVER=r2 R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... npm run verify -- --full
```

This re-reads every object from R2 and re-hashes it. A library that cannot pass this has not
met FR-11. Run it after the first real imports and then monthly (REF-01 FR-40).

## Moving the existing local library up

```bash
DATABASE_URL='postgres://...' PALETTE_STORE_DRIVER=r2 ... npm run import -- ./data/store/originals --recursive --as trevor@hauscustomhomes.com
```

Imports are idempotent by hash, so running it twice adds nothing.

## Not yet exercised

The R2 driver (`src/storage/r2.ts`) was written against the S3 API but has not been run against
a real bucket from this machine. The first `npm run verify -- --full` against R2 is the test.
