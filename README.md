# Family Vault

A private, invitation-only family photo archive built with React, TypeScript, Cloudflare Workers, D1, and private R2 storage. It has no public signup, never exposes permanent object URLs, and is designed to stay inside Cloudflare's free allowances for a small family.

## What is included

- One-time administrator bootstrap and invitation-only registration
- Password login, revocable HTTP-only cookie sessions, backend role enforcement, rate limits, and administrator-assisted recovery
- Browser-generated WebP gallery images and thumbnails; optional original preservation
- Streamed authenticated uploads to a private R2 binding
- Responsive gallery with multi-photo actions, a scrollable fit-to-screen fullscreen viewer, albums, a filterable timeline, comments/reactions API, search, and download
- A memory-linked family tree with relative profiles, parent/partner relationships, photo tagging, and per-person galleries
- Admin membership, invitation, media review, storage/quota, settings, metadata export, and audit records
- D1 migration, tests, Cloudflare deployment configuration, and operations documentation

## Requirements

- Node.js 20.19 or later
- A Cloudflare account for deployment
- Wrangler authentication (`npx wrangler login`)
- R2 activation. Cloudflare currently requires completing R2's checkout/subscription flow, even when usage remains inside the free allowance. This project does not create or activate paid resources for you.

## Local setup

```powershell
cd "$HOME\Desktop\Family-Vault"
npm install
Copy-Item .env.example .dev.vars
```

Replace `BOOTSTRAP_ADMIN_TOKEN` in `.dev.vars` with a long random value. Then initialize the local D1 database and start the app:

```powershell
npm run db:migrate:local
npm run dev
```

Open the printed local URL and visit `/setup`. Supply the same one-time token from `.dev.vars`, your email, display name, and a unique password of at least 12 characters. After the first account exists, `/setup` permanently refuses another bootstrap.

Local R2 objects and D1 data live under `.wrangler/` and are intentionally ignored by Git.

### Populate the local vault with sample photographs

After creating the first administrator, open **Admin → Storage → Load sample photos**. In local development only, this imports six real photographs from [Unsplash](https://unsplash.com/s/photos/family) into the private local R2 emulator and creates a normal “Sample family moments” album. The records use the same gallery, album, comment, reaction, download, and deletion paths as user uploads. Running the importer again is safe; existing samples are skipped.

The importer is restricted to an administrator on `localhost` while `APP_ENV=development`. It returns 404 in production. Sample photographs remain subject to the [Unsplash License](https://unsplash.com/license) and should be deleted before adding private family material if they are no longer useful.

## Verification

```powershell
npm run typecheck
npm test
npm run build
```

## Cloudflare deployment

Nothing is provisioned automatically. In the Cloudflare dashboard, first activate R2 only after reviewing its billing terms. Then:

```powershell
npx wrangler d1 create family-vault-db
npx wrangler r2 bucket create family-vault-photos
```

Put the returned D1 database ID in `wrangler.jsonc`. The bucket is private by default; do not enable `r2.dev` public access. Create the production bootstrap secret without placing it in a file:

```powershell
npx wrangler secret put BOOTSTRAP_ADMIN_TOKEN
npm run db:migrate:remote
npm run deploy
```

Use the resulting free `workers.dev` URL and visit `/setup` once. After setup, you may delete the secret with `npx wrangler secret delete BOOTSTRAP_ADMIN_TOKEN`; the database guard still prevents reuse.

Before production, change `APP_ENV` to `production` in `wrangler.jsonc`. Never commit `.dev.vars`, credentials, Cloudflare API tokens, or R2 S3 keys.

## Operational notes

- The Worker accepts JPEG, PNG, and WebP. HEIC is intentionally excluded until browser support is dependable.
- Gallery derivatives are stripped of EXIF because canvas re-encoding creates clean WebP files. The chosen capture date is stored separately.
- Uploads are capped by both per-file and family quotas before object creation.
- A photograph linked only to a private album is filtered from gallery/search/timeline and blocked at the media endpoint for other members.
- Recovery links are separate from invitations, expire after two hours, are single-use, and invalidate all existing sessions when redeemed.
- Deleting an album removes only junction records, never shared photo objects.
- Private media responses use `private, no-store`; static application assets remain CDN-cacheable.

See [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [COSTS.md](COSTS.md), and [BACKUP.md](BACKUP.md) before deployment.
