# Security model

## Boundaries

The React client is untrusted. User IDs, roles, ownership, album access, quota calculations, object keys, and account state are all re-derived by the Worker and D1. R2 is private and reachable only through the binding.

## Controls

- No public registration; invitations are random, hashed at rest, single-use, expiring, and optionally email-bound.
- Passwords use Web Crypto PBKDF2-HMAC-SHA-256 with a random 128-bit salt and 310,000 iterations. Passwords are never logged or returned.
- Session tokens contain 256 bits of randomness and are stored only as SHA-256 hashes. Cookies are `HttpOnly`, `Secure`, `SameSite=Strict`, and path-scoped.
- Revoking a user deletes active sessions immediately; short-lived object authorizations do not exist, so future media requests fail at once.
- Mutation requests enforce same-origin checks. SQL parameters are bound, text is length-limited, and media MIME/size is checked server-side.
- Media and API responses use `private, no-store`; CSP, HSTS in production, clickjacking, MIME-sniffing, referrer, and permissions headers are set centrally.
- Private album media returns 404 to unauthorized users, reducing identifier-enumeration information.
- Authentication/setup attempts use database-backed fixed-window limits. For a larger deployment, replace this with Cloudflare's native Rate Limiting binding or Turnstile.

## Known decisions and residual risk

PBKDF2 is chosen because it is a standardized, audited Web Crypto primitive available in Workers without a native add-on. Test login CPU time on the selected Workers plan; if Cloudflare's current free CPU allowance proves insufficient, use Workers' supported password-hashing facility or budget for the paid Worker plan—do not reduce iterations casually.

Account recovery is administrator-assisted rather than email-driven, avoiding an email provider and its additional attack surface. After verifying identity out of band, an administrator can generate a hashed, single-use recovery link that expires in two hours. Creating a new link revokes older unused links; redemption changes only the password and invalidates every active session. A revoked member remains revoked until an administrator separately restores access.

Browser-side derivatives intentionally remove EXIF, but preserved originals can still contain location/camera metadata. Make that clear to family members or disable original preservation.

## Production checklist

1. Keep the R2 bucket private; disable public development URLs.
2. Set `APP_ENV=production`; use only HTTPS.
3. Generate a unique bootstrap secret, use it once, then delete it.
4. Review administrators and revoke unused invitations monthly.
5. Keep dependencies updated and rerun typecheck, tests, and build.
6. Test backup restoration at least twice yearly.
7. Never place real family photos in source control, issue trackers, or test fixtures.

Report a suspected compromise by revoking affected accounts, rotating the bootstrap/operational secrets, exporting audit records, and restoring from a verified backup if integrity is uncertain.
