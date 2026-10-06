# Component conventions

- Use semantic HTML and native controls before adding ARIA.
- Use the pinned ReUI primitives through `@coursemap/ui/primitives/*` and extended components through `@coursemap/ui/components/*`. Keep `apps/web/ui/common` for shared Coursemap compositions and `apps/web/ui/<area>` for feature-specific ones.
- Import directly from concrete ReUI modules. Do not create duplicate primitive wrappers.
- Add ReUI components only when a product page needs them. Inspect the pinned source and dependency diff before adding a component.
- Use Lucide for interface icons and include an accessible name where an icon has meaning.
- Dialogs, sheets, menus, popovers and tooltips must support keyboard navigation, focus return and Escape.
- Course states must include text or icon meaning in addition to colour.
- Keep domain calculations outside presentational components.
- Keep client components as small as the interaction requires.
- Verify desktop, mobile, keyboard, empty, loading and error states for material UI changes.
- `AppShell` owns the shared `max-w-8xl` page width, defined in the Tailwind theme. Page and loading wrappers must not add their own width cap. Keep narrower limits for prose and controls; use `fullWidth` or `fullBleed` for interactive canvases.

## Scrolling layouts

- Use `AppShell fill` for desktop workspaces. Pass the remaining height through `workspace-stack` containers and assign `workspace-scroll` to the content that owns scrolling. Avoid subtracting estimated header heights from the viewport.
- Card-based scroll areas reserve space for border rings and a scrollbar in the page gutter. Use `data-scroll-kind="table"` when the scrollbar belongs inside a table instead.
- Keep page scrolling for reading and editing views. Use section navigation and sticky actions for long forms. Narrow screens return to natural page flow.
- Loading, empty and populated states must use the same scroll owner. Check the last item is reachable and its borders are visible, not just that the document fits the viewport.

## Marketing and auth surfaces

- Landing and onboarding pages use theme tokens (`bg-background`, `bg-card`, `border-border`, `text-muted-foreground`) so they follow light and dark mode. Keep them square: small radii (`rounded-sm` to `rounded-lg`), 1px borders between sections and the `LandingGridBackground` grid rather than gradients or photography. The brand violet is the only accent.
- Show the product with small working views built from real components, not screenshots or stock images.
- Use ReUI default control appearance and variants. `cn` merges Tailwind classes; avoid cosmetic overrides that recreate a second component library.
- Use `TabsList variant="line"` for page sections. The shared theme owns tab height, spacing and the purple indicator above the divider; do not add per-page tab styling. Keep compact view toggles on the default variant.
- Decorative product views are marked `aria-hidden="true"` and never carry meaning that is missing from nearby text. An interactive demo is a labelled section with real buttons.

## Copy

- Do not add a visible page title that only repeats the sidebar or breadcrumb label, and do not follow it with a subtitle that restates the filter and the row count. Use a screen-reader-only `h1` and let the content carry the meaning.
- Do not add explainer sections describing how the product works to the people who operate it, and do not give a card a description that paraphrases its own title.
- Every line of interface copy must tell the reader something the surrounding interface does not already show. Delete the rest.
- Use `FilterBar` above a list for search and filtering rather than building controls into the table, so every list behaves the same way.

## ReUI styling and source

- Use the Nova styles and product tokens in `apps/web/app/globals.css`. Keep Coursemap branding and semantic success, warning and error states.
- Stylesheets split by concern: `globals.css` holds tokens, base and product surfaces, `animations.css` holds keyframes, and `vendor.css` holds corrections to React Flow, MapLibre and the Nova preset. Put a new rule in the file that matches what it styles.
- Prefer ReUI defaults. Keep layout, accessibility and product behaviour in Coursemap compositions rather than copying primitive markup.
- The retained upstream source and licence live in `packages/ui`. See `../../../packages/ui/README.md` for the pinned revision and update procedure.
- Keep vendor source formatting intact. Local integration, hooks and compositions remain covered by lint and formatting checks.
- Never import an entire registry or demo catalogue. Retain only components needed by product pages and their dependencies.
