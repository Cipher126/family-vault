# Gmail alerts for uploaded collections

Each completed family upload collection queues one email to the active administrator
configured by `ADMIN_UPLOAD_EMAIL`. The email includes the collection link and a WhatsApp share link.
Private collections do not send announcements. Photo and collection links still require an
invited account and the usual photo permissions.

This uses Gmail SMTP over encrypted TLS on port 465, directly from the existing Worker.
There is no additional email service or Python server.

## One-time setup

1. Sign in to the Gmail account you want to send from.
2. Enable Google 2-Step Verification if it is not already enabled. Open
   [Google App passwords](https://myaccount.google.com/apppasswords) and create a password for
   Family Vault. Use an app password, not the normal Google password. Google documents
   availability and restrictions in [Sign in with app passwords](https://support.google.com/accounts/answer/185833).
3. In the Worker’s Cloudflare settings, set `SMTP_USER` to the sending Gmail address and
   `ADMIN_UPLOAD_EMAIL` to the address of the active Family Vault administrator who should
   receive the alerts. `keep_vars` preserves these settings on subsequent deploys.
4. In PowerShell, run this and paste the app password at the hidden prompt:

   ```powershell
   cd "$HOME\Desktop\Family-Vault"
   npx wrangler secret put SMTP_PASSWORD
   ```

5. Apply migrations and deploy the changes:

   ```powershell
   npm run db:migrate:remote
   npm run deploy
   ```

For local testing, add `SMTP_PASSWORD` to `.dev.vars` along with `SMTP_USER` and
`ADMIN_UPLOAD_EMAIL`. A local public link must be reachable by the recipient; production
mail uses `PUBLIC_APP_URL` from Wrangler configuration. Never commit `.dev.vars` or the password.

## Upload and share

Choose pictures, name the collection, and upload. The completion screen has a large
**Send to family WhatsApp group** button and **Copy link**. WhatsApp opens with the message
already filled in; the uploader chooses the family group and sends it. A separate link is
available for each picture in the viewer's photo actions. Existing albums also have share links.

The **Admin → Uploads** page lists completed collections, email state, and share controls,
so the administrator can share a collection even if the uploader does not.

## Delivery and retries

The database records delivery state per collection. The Worker sends in the background and
a ten-minute scheduled task retries failures. Delivery requires the configured recipient to
remain an active administrator; no fallback recipient is selected. SMTP acceptance means
Gmail accepted the message, not that it reached the inbox. Check Spam when testing.

SMTP has no guaranteed idempotency API. Collection completion and a database lease prevent
normal duplicate sends. If the connection fails after the message was transmitted but before
Gmail acknowledges it, automatic retries stop and Admin → Uploads asks you to check Sent mail.
This avoids silently sending duplicate notifications. Other failures retry at most five times
within 23 hours. Sharing and uploads keep working when email is unconfigured or unavailable.

Transport references: [Cloudflare TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)
and [Gmail SMTP](https://developers.google.com/workspace/gmail/imap/imap-smtp).
