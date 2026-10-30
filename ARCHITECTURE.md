# Architecture

## Decision

Family Vault uses a React SPA and one TypeScript Cloudflare Worker deployed together with Workers Static Assets. The Worker owns every privileged operation. D1 stores normalized metadata and authorization relationships; a private R2 bucket stores original, gallery, and thumbnail objects.

This matches the small-family workload better than a traditional FastAPI server: there is no always-running process, OS, container, load balancer, or managed Postgres instance to maintain. Python/FastAPI would be reasonable for an existing Python team or heavy server-side image processing, but neither applies here and it would weaken the near-zero idle-cost goal.

## Request flow

1. Static HTML/JS/CSS is served through Cloudflare Workers Static Assets.
2. `/api/*` runs the Worker first.
3. The Worker hashes the session cookie, joins it to an active user in D1, and applies route-level authorization.
4. Photo bytes are streamed between the request/response and a private R2 binding. R2 credentials never reach the browser.
5. Private album membership is checked in SQL before metadata or bytes are returned.

## Data model

- `users`, `sessions`, and `invitations` implement identity and membership.
- `photos` owns one physical image set and tracks exact stored bytes.
- `albums` and `album_photos` form a many-to-many relationship, so an image is never duplicated merely because it appears in several albums.
- `comments` and `reactions` are lightweight relational interactions.
- `application_settings` stores quotas and family preferences.
- `family_people`, `family_relationships`, and `photo_people` connect private relative profiles to parent/partner links and authenticated photographs.
- `audit_logs` records sensitive administrative and archive events.

Foreign keys protect relationships. Deleting an album cascades only through `album_photos`; the underlying photo survives. Deleting a photo is a deliberate two-stage flow: mark `deleting`, remove R2 variants, then remove the D1 row.

## Upload design

The browser validates each supported file, corrects orientation through `createImageBitmap`, creates a 2200 px gallery WebP and 560 px thumbnail, and hashes the original. The Worker checks MIME type, byte limits, duplicate hash, and remaining quota before creating a pending row. Each variant is streamed to a server-authorized object key. Completion succeeds only after required R2 objects exist.

This avoids paid transformation APIs and avoids buffering image bodies in Worker JavaScript memory. For the configured 20 MB maximum, single-part streaming is simpler than presigned multipart uploads. If original limits later exceed about 100 MB, adopt R2 S3 multipart presigned uploads rather than raising the Worker path indiscriminately.

## Scaling

Cursor pagination bounds gallery memory. Indexes cover session expiry, ownership, chronological browsing, album joins, and audit history. A small family should remain well below D1 throughput and Worker request limits. At larger scale, first measure D1 rows read and R2 operations; then add denormalized counters or a dedicated thumbnail strategy only where measurements justify them.
