# UI components (shadcn/ui + Tailwind)

New screens are built from these components and the FuseScope tokens. antd and
`@signozhq/ui` are being replaced page by page; don't add new usages of them.

## Rules

- **Utilities carry the `tw:` prefix** (`tw:flex tw:dark:bg-muted`). Legacy
  markup already uses class names such as `hidden`, `p-2` and `outline`, so
  unprefixed utilities would restyle unmigrated pages.
- **No preflight.** The reset in `src/styles/tailwind.css` only applies inside
  an element with the `fs-ui` class. Put `fs-ui` on the root of every new
  screen, and on the content of any component that renders through a Radix
  `Portal` (menus, tooltips, sheets, dialogs, popovers…).
- **Colours come from tokens**: `bg-background`, `text-muted-foreground`,
  `bg-primary`, `text-success-ink`, `bg-series-3`, `text-severity-error`… Never
  raw hex or Tailwind's palette. The values are the `--fs-*` variables in
  `tailwind.css`, light on `:root` and dark on `.dark` (set on `<body>` by the
  app). `--background`, `--primary`, `--sidebar`… belong to
  `@signozhq/design-tokens`; don't define or read them.
- **React 18**: shadcn ships plain function components, which can't receive a
  `ref`. Any component that can be an `asChild` target (or a direct child of a
  Radix Portal) must use `React.forwardRef`; see `button.tsx` and
  `__tests__/forward-ref.test.tsx`.
- `cn()` from `lib/utils` merges classes and understands the prefix.

## Adding a component

```bash
npx shadcn@4.21.1 add <component> --dry-run   # review files, deps and CSS
npx shadcn@4.21.1 add <component> --view src/components/ui/<component>.tsx
```

`components.json` sets the style, aliases and `tw` prefix, so the CLI writes
prefixed classes into `src/components/ui`. It installs with whatever `pnpm` is on
`PATH` and adds the `cn` package, so copy the files it shows instead, or run it
and revert `package.json`/`pnpm-lock.yaml`. Then:

1. Import `cn` from `lib/utils`, not `cn`.
2. Rename any CSS variables it adds to `--fs-*`, with dark values under `.dark`
   and a `--color-*` mapping in `@theme inline`; same for `var(--x)` in classes.
3. Make arbitrary variants that match class names use the prefixed name
   (`[&[class~="tw:border-b"]]`, see `card.tsx`).
4. Add `fs-ui` to portalled content and `forwardRef` where needed (see above).
5. `pnpm tsgo --noEmit`, `pnpm lint`, `pnpm fmt`; add explicit return types.

Stories: `Components/UI` in Storybook (light, dark and the sidebar).
