# Coursemap database

This directory is the source of truth for Coursemap's Supabase configuration,
forward-only migrations and database tests.

## Project

- Project ref: `mogdmhkqkpvksvtvwdgl`
- Region: Sydney (`ap-southeast-2`)
- Plan: Supabase Free

Day-to-day development uses the local Supabase stack. Browser-safe local values
belong in `apps/web/.env.local`; service-role keys and database passwords must
never be committed.

The hosted project is recreated from this directory rather than migrated
forward from what it happens to hold. `migrations/` is an eight-part baseline
that states the schema as it is now; the ninety-five migrations that reached it
are in git history and are not replayed.

## Workflow

```bash
pnpm db:start
pnpm db:reset
pnpm db:test
pnpm db:lint
pnpm db:types
```

Add each schema change as a new migration after the baseline. Rebuild locally,
regenerate `apps/web/types/database.ts`, run the database gates, then run
`pnpm verify`.

Edit a baseline part only to correct something that has never been deployed.
Once the hosted project has applied a file, changing it puts the two out of
step, and a forward migration is the only way back.

`seed.sql` intentionally contains no catalogue or user fixtures. `pnpm db:reset` performs an explicitly local reset, then applies the separate preview
fixture through a database client that refuses every non-loopback connection.
Reapply it to an already running local stack with `pnpm db:seed:preview`.
The demonstration catalogue uses explicit mock provenance and separate
`DEMO-*` structure codes. Authoritative catalogue data must still be imported
with source URLs, retrieval metadata and content hashes.

## Administrator access

Application roles live in the private schema and are never inferred from an
email address or editable user metadata. The first administrator must be
bootstrapped from Supabase Studio's SQL editor, replacing the example address:

```sql
insert into private.user_roles (user_id, role_id, granted_by)
select users.id, roles.id, users.id
from auth.users as users
cross join private.app_roles as roles
where users.email = 'developer@example.test'
  and roles.key = 'admin'
on conflict (user_id) do update
set
  role_id = excluded.role_id,
  granted_by = excluded.granted_by,
  granted_at = now();
```

Every new account receives the `User` role. This is the only bootstrap
operation. Afterwards, an admin can open `/admin/users` and switch an account
between `User` and `Admin`. Role permissions are database-managed and editable
from `/admin/roles`. The database prevents admins from changing their own role
or removing the final admin.

## Rebuilding the baseline

The baseline was produced from a local database with every migration applied,
so it states the schema exactly rather than describing it. Three things a
schema dump does not carry, and which any future rebuild has to put back:

- Supabase grants `anon` and `authenticated` everything on each new object in
  `public`. Each object is taken back to nothing before it is granted anything,
  and the schema defaults are narrowed before the first table exists. Without
  that, every grant in these files is a no-op on top of the defaults.
- `on_auth_user_created` and `on_auth_user_email_changed` sit on `auth.users`,
  which a dump of `public` and `private` never sees.
- The reference rows the schema ships with -- the permission model, the
  academic years and periods, the import models, and ANU Acton's places and
  features -- are data, not schema.

A rebuild is correct when `pnpm db:test`, `pnpm db:lint` and
`pnpm test:catalogue-db` pass and `pnpm db:types` leaves
`apps/web/types/database.ts` unchanged.

## Operational follow-up

Previously reported adviser notices include authenticated SECURITY DEFINER
RPCs, disabled leaked-password protection, overlapping read policies and index
notices. Recheck current hosted advisories before operational changes.
Password protection and policy and index tuning remain separate follow-up
work.
