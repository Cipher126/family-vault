# Family file sharing

Open **Files** to upload documents, recordings, videos, images, and archives (50 MB per
file, 20 files per selection). Create a folder first and open it to upload into that
folder. Folders are one level deep. Files keep their original bytes; they are not
converted or compressed.

Use a file's **⋮** menu to download, copy its permanent link, send the link through
WhatsApp, or delete it. A folder also has its own share link. Recipients must sign in
with an invited family account. WhatsApp messages are sent manually by the user.

Folder owners can rename folders and add, change, or remove a password. Passwords
have 8–128 characters and are stored as salted hashes. Other members, including
administrators, need to unlock a protected folder to browse or download its files.
Unlocks apply to one sign-in session for up to 12 hours; signing out, manually locking,
or changing the password revokes access. Owners do not need to unlock their own folders.
File links enforce the same folder protection as browsing.

The uploader or an administrator can delete an accessible file. Only the folder owner
can delete a folder, and it must be empty. Deletions require a confirmation dialog.

## Storage and recovery

Files use the existing private R2 bucket, under `files/`, with metadata in D1. Pending
uploads reserve space against the same quota as photos. An atomic database reservation
prevents concurrent photo/file uploads exceeding the quota. Files become visible only
after storage accepts the reserved byte count. The client reuses an upload identifier
when retrying; completed retries do not create duplicate files.

Every ten minutes, the existing scheduled Worker cleans abandoned uploads (after a
one-hour expiry plus one-hour safety window), expired unlocks, and interrupted deletions.
Files are served as downloads with no browser caching and never executed inline.
Executable and HTML file extensions are not accepted. File contents are not virus-scanned.

Folder passwords control application access; they do not encrypt files. Existing
administrator exports and full backups include **all shared files**, including protected
folders. Folder hashes, unlock grants, and account credentials are excluded from exported
metadata. Keep administrator backups private.

## Deployment

Apply `0010_shared_files.sql` before deploying the new Worker. It adds tables without
changing existing photo records. No new bucket, service, or secret is required.

```powershell
npm run db:migrate:remote
npm run deploy
```

Tests exercise private links, session-specific unlocking, password changes, mutation
authorization, retry behavior, quota enforcement, failed storage deletion recovery,
size/type validation, exports, and mobile action flows. The UI preview uses sample
files only; it never stores or emails real uploads.
