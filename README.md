<div align="center">

<img src="apps/web/public/logo.svg" alt="" width="72" />

# Coursemap

**Plan an ANU degree you can actually explain.**

Prerequisite paths, requirement audits, campus room finding and every key date,
in one place that updates when the catalogue does.

[![CI](https://github.com/HarryRandall/anu-coursemap/actions/workflows/ci.yml/badge.svg)](https://github.com/HarryRandall/anu-coursemap/actions/workflows/ci.yml)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Built with pnpm](https://img.shields.io/badge/pnpm-workspaces-F69220?logo=pnpm&logoColor=white)](https://pnpm.io)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/plan-dark.png" />
  <source media="(prefers-color-scheme: light)" srcset="docs/images/plan-light.png" />
  <img src="docs/images/plan-dark.png" alt="The Coursemap plan board showing a three-year degree plan laid out by year and semester, with unit totals per semester." width="900" />
</picture>

</div>

## What it does

Degree planning at ANU usually means a PDF, a spreadsheet and a lot of hope.
Coursemap replaces that with something that checks its own work.

- **Plan board.** Drag courses across years and semesters. Unit loads total
  themselves, and a course whose prerequisites are not met is flagged in place
  with a suggested fix.
- **Requirement audits.** Your plan is checked against the published programme
  rules, so you find the gap in second year rather than in final year.
- **Prerequisite graphs.** See what a course unlocks and what it needs first.
- **Room finder.** Find a room on campus, including a 3D view inside the
  building rather than a flat floor plan.
- **Key dates.** The ANU university calendar, scraped through a reviewable
  pipeline instead of copied by hand.
- **Catalogue administration.** Imports are proposals. A human reviews every
  extraction before it is published, and nothing overwrites a working draft
  silently.

<div align="center">
  <img src="docs/images/courses-dark.png" alt="The Coursemap course directory listing courses with their codes, requisites, availability and unit values." width="820" />
</div>

> [!NOTE]
> Coursemap is an independent tool and not an official ANU system. Confirm your
> study plan against Programs and Courses and your college's academic advice.

## Quick start

You need Node 24, Docker and the Supabase CLI. pnpm comes from the
`packageManager` field, so any recent pnpm can bootstrap it.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm db:start      # local Supabase stack
pnpm db:reset      # migrations plus demonstration fixtures
pnpm dev           # http://127.0.0.1:3000
# Or build and run the production server against the same local stack:
pnpm build
pnpm start
```

Sign up at `/signup` and the local stack issues a session straight away. To run
against a hosted Supabase project instead, configure its URL, publishable key
and your application origin in `apps/web/.env.local`, then use the explicit
`pnpm dev:prod`, `pnpm build:prod` and `pnpm start:prod` commands.
The [environment template](apps/web/.env.example) explains the required settings,
optional import credentials and map-service defaults.

Development uses webpack, matching production builds, to avoid a Turbopack
hot-reload panic (`VersionedContents` cells no longer exist).

## How it is built

A pnpm workspace with Turborepo task caching.

```
apps/web        Next.js 16 App Router application
  app/          routes, layouts and their colocated page components
  ui/common/    Coursemap components shared across areas
  ui/<area>/    components for one feature area
  lib/          domain logic, data access and parsing
packages/ui     vendored ReUI design system, primitives and theme
supabase/       migrations, RLS policies and pgTAP tests
```

Two rules keep it honest. `packages/ui` knows nothing about courses or plans,
which a test enforces. Every dependency version lives in the `catalog:` block of
`pnpm-workspace.yaml`, so no package can drift onto its own version of React.

Domain logic stays out of components, durable data stays in Postgres behind Row
Level Security, and the service-role key never reaches the browser.

## Commands

| Command              | What it does                                           |
| -------------------- | ------------------------------------------------------ |
| `pnpm dev`           | Development server against local Supabase              |
| `pnpm dev:prod`      | Development server using configured hosted credentials |
| `pnpm build`         | Production build against local Supabase                |
| `pnpm start`         | Built production server against local Supabase         |
| `pnpm preview:local` | Build and start against local Supabase in one step     |
| `pnpm build:prod`    | Production build using configured hosted credentials   |
| `pnpm start:prod`    | Built server using configured hosted credentials       |
| `pnpm check`         | Formatting, lint and strict types                      |
| `pnpm test`          | Unit and component tests                               |
| `pnpm test:e2e`      | Authenticated browser journeys                         |
| `pnpm db:reset`      | Rebuild the local database and reseed fixtures         |
| `pnpm db:test`       | pgTAP database tests                                   |
| `pnpm db:types`      | Regenerate committed database types                    |
| `pnpm verify`        | Local application delivery checks                      |

Run `pnpm verify` before opening a pull request. CI additionally runs database
checks, authenticated browser journeys and a production dependency audit. See
the [verification matrix](CONTRIBUTING.md#verification).

## Documentation

[Contributing](CONTRIBUTING.md) ·
[Architecture](docs/architecture.md) ·
[Documentation index](docs/README.md) ·
[Code conventions](docs/conventions.md) ·
[Database setup](supabase/README.md) ·
[Security policy](SECURITY.md) ·
[Agent guide](AGENTS.md)

<div align="center">
<sub>Screenshots use demonstration fixtures, not real student records.</sub>
</div>
