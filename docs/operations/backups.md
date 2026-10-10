# Backup and restore

## Coverage and limits

The [database guide](../../supabase/README.md) records the hosted project as
Supabase Free. Plan entitlement has not been checked in the hosted dashboard.
The working assumption is that Free does not offer the paid-plan downloadable
daily backup retention or point-in-time recovery (PITR). Current Free limits,
retention, project pausing and restore availability are **unverified**. Check
the project's plan and the [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups)
before relying on managed recovery. An independent export is required until a
tested recovery path exists.

A logical database dump contains rows and, when requested separately, schema.
It does not contain Storage object bytes, hosted settings, API keys, Auth provider
configuration or application secrets. Keep the deployed Git revision, migration
history, CLI and PostgreSQL versions, bucket configuration and a separate secure
configuration inventory with each backup set. Never commit dumps or credentials.

The private `course-import-artifacts` bucket is provisioned by
[`supabase/config.toml`](../../supabase/config.toml), **not migrations**. Applying
SQL migrations alone does not create it. Hosted bucket provisioning is a separate
operation, currently exposed as `corepack pnpm db:storage:buckets:linked`; verify
the linked restore target before using it. The bucket's size and MIME restrictions
must match the configuration.

## Scheduled exports

Use a trusted scheduler configured for 02:00 Australia/Sydney each day, outside
pull-request CI. Give its operator responsibility for failures and overdue
backups. Store the database connection and S3 credentials in the scheduler's
secret store, disable shell tracing, restrict temporary files and encrypt the
destination. Start with 30 daily dated sets, then agree retention and acceptable
data loss with the owner. A daily job provides at best a 24-hour recovery point
when every run succeeds; it is not PITR.

With a pinned Supabase CLI and Docker available, the database part is:

```bash
set -euo pipefail
umask 077
backup_dir="$(mktemp -d)"

supabase db dump --db-url "$BACKUP_DB_URL" \
  --schema public,private,auth,storage --data-only --use-copy \
  --file "$backup_dir/data.sql"

supabase db dump --db-url "$BACKUP_DB_URL" \
  --schema public,private --file "$backup_dir/schema.sql"
```

The explicit schema list includes student identity and Storage metadata as well
as application rows. The CLI's default dump excludes managed schemas; do not
assume a default dump includes Auth or Storage. Validate the pinned CLI's flags,
database privileges and resulting table coverage in the first drill. Managed
`auth` and `storage` tables require a compatible target Supabase version. Do not
replay their internals into a different version without a reviewed restore plan.
Retain the repository migrations as the schema authority; the schema export is
additional evidence, not a replacement migration history. Extension-owned data,
roles and any additional schemas need an explicit coverage decision.

Copy the files, manifest and Storage snapshot to a separate encrypted backup
destination under a dated prefix, verify checksums there, then remove the
temporary files. Record start/end times, deployed revision, schema/table coverage,
row counts and object counts. Alert on failure, a missing daily set or a failed
checksum. Do not mark the set complete until both database and Storage copies
are verified.

## Storage objects over S3

Database backups contain Storage metadata, **not Storage objects**. Losing
`course-import-artifacts` bytes loses the source and extraction evidence even
when `catalogue_sync_artifacts` rows survive. Use Supabase's
[S3 protocol](https://supabase.com/docs/guides/storage/s3/compatibility) to copy
objects while preserving their complete keys:

```bash
# Use source-project S3 access credentials from the secret store.
aws --endpoint-url "$SUPABASE_S3_ENDPOINT" --region "$SUPABASE_S3_REGION" \
  s3 cp s3://course-import-artifacts/ \
  "$backup_dir/course-import-artifacts/" --recursive

# Use separate destination credentials and a unique dated prefix.
aws --profile coursemap-backup-target s3 cp "$backup_dir/" \
  "s3://$BACKUP_BUCKET/coursemap/$BACKUP_SET/" --recursive
```

Obtain the endpoint, region and S3 access credentials from the project's Storage
settings. A browser publishable key is not an S3 credential. Keep source and
destination credentials separate. Use immutable dated copies rather than a
mirror that deletes old objects. Include a key/size/checksum inventory and verify
downloaded bytes; multipart ETags are not universal content checksums. Inventory
the whole bucket, including objects without an application row.

Database export and S3 copying do not share an atomic snapshot. Pause catalogue
syncs and other artifact writes during a coordinated backup, or inventory before
and after and retry any changed/missing keys. Record the consistency window.
The S3 settings in `config.toml` describe the local stack; hosted endpoint access
and the bucket's current existence remain unverified.

## Restore drill

Run a drill at least quarterly and after schema, Auth, Storage or backup-tool
changes. Use an isolated local stack or an explicitly approved disposable
project, never production. Keep catalogue workers, paid extraction, queue
publishing and outward email disabled.

1. Download a completed backup set and verify its manifest and checksums.
   Record the selected recovery point, CLI/PostgreSQL versions and start time.
2. Rebuild the target from the exact recorded migrations. Supabase supplies its
   managed schemas. Provision `course-import-artifacts` separately from
   `config.toml` and restore the reviewed Auth/provider and application settings.
3. Review and prepare the target's existing reference and seed rows before
   loading data. Migrations already insert reference rows, so a blind data-only
   replay can collide. Establish a table order and a clean target data state in
   the disposable environment; do not truncate a live project. Decide which
   managed Auth/Storage rows can safely be replayed for the target version.
4. Restore the reviewed data with error stopping and a transaction. For an
   approved compatible, empty target, the basic loader is:

   ```bash
   psql "$RESTORE_DB_URL" --set ON_ERROR_STOP=on --single-transaction \
     --file "$backup_dir/data.sql"
   ```

   Foreign-key cycles, triggers and pre-existing managed rows may require a
   reviewed staged load. Do not silently disable constraints or ignore errors.
   Verify Auth identities, private role assignments and application ownership
   together before allowing sign-in.

5. Copy the saved objects to the provisioned bucket via the target S3 endpoint:

   ```bash
   aws --endpoint-url "$RESTORE_S3_ENDPOINT" --region "$RESTORE_S3_REGION" \
     s3 cp "$backup_dir/course-import-artifacts/" \
     s3://course-import-artifacts/ --recursive
   ```

   Use target credentials. Reconcile restored metadata with S3-created metadata
   according to the pinned Storage version; confirm overwrites and orphan handling
   in the drill rather than assuming metadata replay is sufficient.

6. Compare row counts, published catalogue pointers, student plans and attempts,
   Auth/role records and artifact object hashes. Exercise sign-in, authorisation,
   catalogue reads, a student plan and a permitted artifact download. Check that
   unauthorised users cannot read the private bucket.
7. Record elapsed recovery time, data loss window, discrepancies and corrective
   actions. Keep the drill evidence with the backup manifest. A successful dump
   without a successful restore drill is not verified recoverability.

No schedule, hosted backup, hosted bucket provisioning or restore drill has been
executed as part of adding this guide. Confirm the plan entitlement, full dump
coverage, credential permissions and compatible restore procedure before treating
this as an operational recovery guarantee.
