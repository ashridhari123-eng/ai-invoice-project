# P2P Invoice Processor

End-to-end procure-to-pay (P2P) app built with Next.js (App Router), Prisma ORM, and
PostgreSQL on Supabase. Includes vendor/item/budget management, requisitions, RFQs with
AI award recommendations, purchase orders, invoice capture + AI extraction (Anthropic),
two-way approval workflows, and Zoho Books sync.

## Tech stack

- **Framework:** Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4
- **Database:** PostgreSQL on Supabase (Prisma ORM 7 + `@prisma/adapter-pg`)
- **Auth:** Cookie-session JWTs (jose) with role-based permissions
- **AI:** Anthropic Claude for invoice extraction & RFQ award recommendations (mock mode when no API key)
- **Sync:** Zoho Books OAuth 2.0

## Local development

Prereqs: Node 20+, a Supabase project.

1. Install deps:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the Supabase connection strings and secrets:

   ```
   DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=no-verify"
   DIRECT_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require"
   AUTH_SECRET="<32-byte hex>"
   ZOHO_ENCRYPTION_KEY="<32-byte hex>"
   ANTHROPIC_API_KEY=""   # optional — app falls back to mock mode
   ```

   Generate secrets with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. Create the schema in the database:

   ```bash
   npm run db:push
   ```

4. Seed demo data (org `MERIDIAN`, users like `admin@demo.com` / `Password123!`):

   ```bash
   npm run db:seed
   ```

5. Run the dev server:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000 and log in with `admin@demo.com` / `Password123!`.

## Deploy to Vercel with Supabase

1. **Supabase** — create a project, then copy the **connection strings** (Supabase Dashboard
   → Project Settings → Database → Connect). You need:
   - `DATABASE_URL`: the transaction-mode **pooler** URL (port `6543`, includes `pgbouncer=true`)
   - `DIRECT_URL`: the direct connection URL (port `5432`) — used by Prisma CLI for `db push`/migrations

2. **Create the schema** in Supabase once (run from your machine):

   ```bash
   npm run db:push
   npm run db:seed
   ```

   > If you have an existing database, `db push` is idempotent — it only applies missing
   > changes. A generated initial migration is also committed in `prisma/migrations` for
   > those who prefer `prisma migrate deploy`.

3. **Vercel**
   - Import the git repo and set the **Root Directory** to `p2p-app` (this folder).
   - The `build` script runs `prisma generate && prisma db push && next build`, so the
     schema stays in sync on every deploy. Set the following **Environment Variables**:

     | Name                  | Value                                        |
     | --------------------- | -------------------------------------------- |
     | `DATABASE_URL`        | Supabase pooler connection string            |
     | `DIRECT_URL`          | Supabase direct connection string            |
     | `AUTH_SECRET`         | 32-byte hex (same as local)                  |
     | `ZOHO_ENCRYPTION_KEY` | 32-byte hex (same as local)                  |
     | `ZOHO_CLIENT_ID`      | Zoho API Console client ID (optional)        |
     | `ZOHO_CLIENT_SECRET`  | Zoho API Console client secret (optional)    |
     | `ZOHO_REDIRECT_URI`   | `https://<your-app>.vercel.app/api/zoho/callback` |
     | `ANTHROPIC_API_KEY`   | Anthropic key (optional; enables AI features) |

   - Deploy. Default demo login: `admin@demo.com` / `Password123!` (seeded above).

### Notes for serverless (Vercel)

- **Uploaded invoice files are stored in Postgres** (`CapturedDocument.storedData`),
  not on the local filesystem, so they survive cold starts / redeploys.
- All pages and API routes are dynamic (server-rendered), so no build-time DB access is
  needed — the build connects to the DB only via `prisma db push`.
- `prisma db push` during builds is a convenience for this project's stage. If you later
  want strict migrations, use `prisma migrate deploy` instead: run
  `npx prisma migrate resolve --applied 20260805000000_init` once against your existing DB,
  then change the `build` script to `prisma generate && prisma migrate deploy && next build`.
- Zoho OAuth tokens are encrypted at rest with `ZOHO_ENCRYPTION_KEY`.

## Useful commands

```bash
npm run dev          # start dev server
npm run build        # generate client, push schema, production build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm test             # unit tests (node --test + tsx)
npm run db:push      # sync Prisma schema to the database
npm run db:deploy    # apply committed migrations
npm run db:seed      # seed demo data
npm run db:studio    # Prisma Studio
```
