# ReUI components

Coursemap uses the Radix ReUI source at upstream commit
`8a2c701eaf95729f238274d5ce2555a5a8bd23e7` (v2.5.2), from the official
[ReUI repository](https://github.com/keenthemes/reui). The MIT licence is
preserved in `LICENSE.md`.

`primitives/` holds the required shadcn primitives; `components/` holds the required
extended ReUI components. Hooks and utilities are retained only when these
components need them. Import through the `@coursemap/ui` package. There are no demo
catalogues or component reference routes.

`style-nova.css` retains only the sections for components this repository
vendored. The 32 upstream sections for components Coursemap never took
(questionnaire, bubble, attachment, combobox, menubar, drawer, navigation menu
and the rest) were removed, which is the same policy already applied to the
components themselves. Removing them cut 139 KB from the compiled stylesheet
with no rendered difference. When taking a new component from upstream, copy
its `MARK:` section across with it.

Use ReUI defaults and the Nova stylesheet. `apps/web/app/globals.css` owns Coursemap's
brand and theme values. `theme.css` maps tokens and adapts Radix state attributes
to the Nova stylesheet. `icon-placeholder.tsx` resolves upstream icon names to
Lucide. Calendar compatibility adjustments support our existing dependency
versions.

## Adding or updating a component

Copy only the required public Radix component and its dependencies from the
pinned official revision, or review a deliberate upstream version update first.
Rewrite upstream imports to concrete `@coursemap/ui/primitives`, `@coursemap/ui/components`,
`@coursemap/ui/hooks` and `@coursemap/ui/lib` modules. Preserve the licence and upstream
formatting; document any compatibility changes. Never import the full registry
or its examples. Run `pnpm verify` and check the affected product flow in a
browser after changing retained source or dependencies.

## Coursemap adjustments

- `ui/tooltip.tsx`: `TooltipContent` defaults to `sideOffset = 6`. Coursemap
  hides the tooltip arrow and restyles the surface in `apps/web/app/vendor.css`, so the
  offset provides the gap the arrow used to.

- Select: `apps/web/app/vendor.css` gives the content a 0.25rem inset so
  highlighted options sit inside the menu rather than against its edge.

- Breadcrumb: retained the pinned Radix primitive and Nova breadcrumb styles. The application shell adapts ReUI `c-breadcrumb-2` with width-based collapsing and hover access to its dropdown.

- Notifications: the application shell adapts pinned ReUI `c-dropdown-menu-11` with hard-coded sample messages, Lucide icons in place of avatars, and local unread state. The mark-all action uses a keyboard-accessible menu item; the panel is constrained to the viewport.
