# Code conventions

Use British English, straight apostrophes and no em dashes in authored prose,
comments and interface copy. Preserve external API names and quoted source text.
Prettier owns formatting; ESLint owns mechanically enforceable code rules.

## Naming

| Element                      | Convention           | Example                             |
| ---------------------------- | -------------------- | ----------------------------------- |
| Source files and directories | kebab-case           | `requisite-conditions.ts`           |
| Components and types         | PascalCase           | `CoursePicker`, `PlanningCatalogue` |
| Functions and variables      | camelCase            | `planningCourseForAttempt`          |
| Fixed domain constants       | UPPER_SNAKE_CASE     | `STANDARD_TERM_UNITS`               |
| Boolean values               | A readable predicate | `isPublished`, `canEdit`            |

Use domain terms and names that describe the result or action. Include units in
numeric names when ambiguous, such as `timeoutMs`. Avoid generic `data`, `utils`
and `manager` names for modules with a more specific responsibility.
Framework filenames, route segments, generated types and vendored source retain
their required names. SQL follows the existing snake_case schema.

## Modules and imports

Use named exports. Default exports belong to framework entry points and config
files. Prefer function declarations for named behaviour; callbacks and functions
wrapped by APIs such as React `cache` can remain expressions.

Use `import type` for type-only dependencies. Inline `type` specifiers are also
appropriate when the same module supplies values. Keep imports at the top, after
framework directives, with external packages before application and relative
imports. Preserve side-effect import order. Import concrete modules rather than
adding broad barrel exports.

Type annotations such as `import("maplibre-gl").Map` are allowed for dynamically
loaded libraries. These do not load the library at runtime.

Keep one cohesive responsibility per module. Extract independent components when
they have their own behaviour, callers or tests. Small private rendering helpers
and compound component APIs can stay together. File length alone is not a reason
to split. Preserve vendored `packages/ui` source structure.

## Comments and API documentation

Explain constraints, surprising behaviour and tradeoffs that names and types
cannot express. Use `//` for a local explanation and `/** ... */` for a contract
that callers should see in editor hints. Document non-obvious return values,
mutation, ordering, units and error conditions where relevant.

```ts
/** Returns undefined when the catalogue cannot identify a unique course year. */
export function planningCourseByCode(/* ... */) {
  /* ... */
}

// jsdom does not perform layout. Real resize behaviour is covered in Playwright.
```

Do not add JSDoc to every function or repeat TypeScript types in `@param` tags.
Use tags when their description adds meaning. Avoid filename banners, decorative
section dividers, change narration and comments that merely restate the code.
Keep a TODO only when it explains the missing work and references a tracked issue.
An intentionally ignored error needs a brief reason; other failures must reach
the caller or the established error-reporting path.

## Configuration comments

Configuration files are also setup guides. Use short comment sections to group
settings by purpose, with plain ASCII separators in longer templates such as
`.env.example`. For each environment setting, explain whether it is required,
which feature needs it, its default or unset behaviour, and where to obtain a
value. State browser visibility and build-time behaviour where relevant.

Keep optional examples commented out and credentials empty. Check defaults
against the consuming code before documenting them. In tool configs, explain
non-obvious choices and exceptions next to the setting. Avoid copying an entire
upstream manual or adding a comment that only repeats the option's name.

## Errors and interface copy

Write complete, specific error messages with a final full stop, for example:
`The catalogue sync could not be claimed.` Describe the failed operation and
preserve useful error context without exposing credentials or private records.
Use existing error types and handling patterns. Interface copy follows
[UI conventions](../apps/web/ui/AGENTS.md).

## File placement

| Responsibility                               | Location                   |
| -------------------------------------------- | -------------------------- |
| Routes, layouts and route-local composition  | `apps/web/app/`            |
| Shared product components                    | `apps/web/ui/common/`      |
| Feature components                           | `apps/web/ui/<area>/`      |
| Domain calculations, data access and parsing | `apps/web/lib/`            |
| Application operational scripts              | `apps/web/scripts/<area>/` |
| Repository maintenance scripts               | `scripts/`                 |
| Vendored design system                       | `packages/ui/`             |
| Migrations and database tests                | `supabase/`                |

Keep domain calculations outside components and client boundaries as small as
the interaction requires. Operational scripts use `.mjs`, export named behaviour
with injectable inputs and guard their entry point so importing them has no
operational side effects. See [architecture](architecture.md) for system boundaries.
