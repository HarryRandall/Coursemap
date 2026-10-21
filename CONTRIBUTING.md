# Contributing

Coursemap is currently a private project. Keep changes focused, reviewable and reproducible.

## Local setup

Install Node 24, Docker and the Supabase CLI. Use the pnpm version pinned in
`package.json`; a recent pnpm installation can bootstrap that version.
Use the Supabase CLI version pinned in `.github/workflows/ci.yml`.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm db:start
pnpm db:reset
pnpm dev
```

`pnpm db:reset` rebuilds the local database and loads demonstration fixtures.
Open [localhost:3000](http://127.0.0.1:3000) and sign up at `/signup`; the local
stack issues a session straight away. Use `pnpm dev --port 3001` when another
server is already using port 3000.

The [environment template](apps/web/.env.example) explains the required settings,
optional import credentials and map-service defaults. See the
[database setup guide](supabase/README.md) for local database details.

### Production preview

Build and run the production server against the local Supabase stack:

```bash
pnpm build
pnpm start
```

`pnpm preview:local` builds and starts the local production preview in one step.
Development uses webpack, matching production builds, to avoid a Turbopack
hot-reload panic (`VersionedContents` cells no longer exist).

### Hosted development

To use a hosted Supabase project, configure its URL, publishable key and your
application origin in `apps/web/.env.local`. Then use `pnpm dev:prod`,
`pnpm build:prod` and `pnpm start:prod` instead of their local equivalents.

## Workflow

1. Create a branch prefixed with `feat/`, `fix/` or `refactor/`.
2. Make one coherent change and update tests and documentation with it.
3. Run `pnpm verify`. For database changes, also run `pnpm db:reset`,
   `pnpm db:test`, `pnpm db:lint` and `pnpm db:types`.
4. Open a pull request using the repository template.
5. Merge only after required checks pass.

Use conventional commit subjects such as `feat: add email sign-in` or `refactor: move catalogue reads to Supabase`. Write in British English, use straight apostrophes and avoid em dashes.

## Conventions

Follow [code conventions](docs/conventions.md) for naming, comments and placement,
and [UI conventions](apps/web/ui/AGENTS.md) for product components.

## Verification

| Command                                                                                    | Purpose                                                                              | When required                         |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------- |
| `pnpm check`                                                                               | Formatting, repository conventions, lint and strict types                            | During development and CI             |
| `pnpm test`                                                                                | Unit and component regressions                                                       | Included in local verification and CI |
| `pnpm verify`                                                                              | Check, unit/component tests, production build, anonymous access tests and whitespace | Before hand-off or a PR               |
| `pnpm db:reset`, `pnpm db:test`, `pnpm db:lint`, `pnpm db:types`, `pnpm test:catalogue-db` | Local migrations, policies, schema, generated types and import integration           | Database changes; CI database gate    |
| `pnpm test:e2e`                                                                            | Authenticated browser journeys using local Supabase                                  | Affected journeys; CI browser gate    |
| `pnpm audit --prod --audit-level=high`                                                     | Production dependency audit                                                          | Dependency changes; CI quality gate   |

`pnpm verify` is the local application gate, not all CI jobs. Report checks that
passed, failed or did not run. Do not run production builds concurrently because
they share `apps/web/.next`. Database resets require a task-owned local stack.
Documentation-only changes do not require a database reset.

Run `corepack pnpm --filter @coursemap/web test:dates:utc` for the focused
academic date regressions in UTC, alongside the normal unit suite. Check the
same subset in Sydney with
`TZ=Australia/Sydney corepack pnpm --filter @coursemap/web test:dates`.

## Database changes

- Put forward-only SQL migrations in `supabase/migrations`.
- Enable RLS and add explicit grants and policies for every exposed relation.
- Regenerate committed TypeScript database types from the local database after
  applying a migration.
- Include tests for ownership boundaries and privileged actions.
- Keep the local Supabase CLI version aligned with the pinned CI version.
- Never expose a service-role key to browser code.

## Catalogue changes

Catalogue data must include its source, catalogue year and retrieval provenance. Do not treat prototype fixtures, generated timetables or inferred prerequisite rules as authoritative ANU data.
