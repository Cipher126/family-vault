# Backup and recovery

R2 is the primary object store, not a complete backup. Account mistakes, malicious deletion, credential compromise, and application bugs can affect primary data. Keep an independent copy.

## Recommended no-subscription routine

For the simplest family-readable backup, sign in as an administrator and open **Admin → Storage → Full archive**. The downloaded `.tar` contains `family-vault-metadata.json` including relatives, relationships, photo tags, shared memories and their photo membership, plus the best available copy of every photograph (the preserved original when enabled, otherwise the optimized gallery copy). Windows 11, macOS, and common archive applications can extract TAR files.

Store that archive on an encrypted external drive and open several photographs after every download. This protects the memories in a portable format, but the provider-level export below is still the fastest way to restore the live application exactly as it was.

Once a month, connect an encrypted external drive and create a dated folder containing:

1. A D1 SQL export.
2. An R2 object mirror preserving object keys.
3. The administrator JSON metadata export.
4. A copy of the application source at the deployed Git commit.

```powershell
$date = Get-Date -Format yyyy-MM-dd
$backup = "E:\FamilyVaultBackups\$date"
New-Item -ItemType Directory -Path $backup
npx wrangler d1 export family-vault-db --remote --output "$backup\database.sql"
```

For the R2 mirror, create a narrowly scoped R2 S3 token, configure AWS CLI or rclone temporarily, and sync the private bucket to `$backup\objects`. With AWS CLI the endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`:

```powershell
aws s3 sync s3://family-vault-photos "$backup\objects" --endpoint-url "https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
```

Do not save S3 credentials in this repository. Remove temporary credentials from the shell/configuration after the backup. Download `/api/admin/export` while signed in and save it as `metadata.json`.

## Verification

- Compare the number and total bytes of local object files with the Admin Storage page.
- Confirm `database.sql` is non-empty and contains `CREATE TABLE` and `INSERT` statements.
- Randomly open at least five originals from different years.
- Compute and retain a SHA-256 manifest for the backup folder.
- Keep at least three dated generations and store the drive away from the primary computer.

An optional second encrypted drive stored with a trusted relative provides inexpensive offsite protection. Cloud storage can automate offsite copies, but review its recurring storage/egress charges first.

## Restore drill

1. Create a fresh D1 database and private R2 bucket; do not overwrite production during a test.
2. Import the SQL: `npx wrangler d1 execute <new-db> --remote --file database.sql`.
3. Sync the backed-up `objects` directory to the new bucket with AWS CLI/rclone.
4. Point a staging `wrangler.jsonc` at the new resources and deploy.
5. Sign in, compare member/album/photo counts, browse private albums, download originals, and test an invitation.
6. Only after verification should DNS or the production Worker bindings be changed.

If an R2 deletion finishes but its D1 deletion fails, the row remains marked `deleting`; investigate it before purging or restoring. If D1 deletion finishes while an object remains, the object is an orphan and can be removed after confirming no current row references its key.
