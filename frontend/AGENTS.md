# FuseScope frontend · engineering rules

Scope: `frontend/` (React 18, Vite, TypeScript, react-query, antd + `@signozhq/ui`,
CSS Modules, Jest, Storybook, Playwright e2e under `tests/e2e`). The repo-wide
rules in the [root `CLAUDE.md`](../CLAUDE.md) apply on top of this file —
license posture, tests first, brand, commits.

Run everything with `npx pnpm@10 …` (the repo rejects pnpm 11).

## Tests first

- Behaviour changes (new state, request, permission check, form field, route)
  start with a failing test: Jest + Testing Library next to the code in
  `__tests__/`, a Storybook play test for page states, or a Playwright spec for
  cross-page flows.
- Bug fixes start with a regression test that reproduces the bug.
- Copy and purely visual changes don't need a new test, but every existing test
  that asserts the old text must be updated — including case-insensitive regexes
  (`/old name/i`) in Jest, Storybook play tests and e2e specs.
- Prefer `data-testid` / `testId` selectors on behavioural elements (inputs,
  buttons) and use them in tests instead of role or text lookups.
- No snapshot tests that just freeze rendered output.

## TypeScript

| Rule | Why |
|---|---|
| No `any`. Use `unknown` and narrow with a type guard | `any` disables the type system |
| No `as` casts except at third-party boundaries with worse typings than reality | casts hide real type errors |
| Model state as discriminated unions (`{ status: 'loading' } \| { status: 'error'; error: APIError }`) rather than bags of optional fields | impossible states become unrepresentable |
| More than three type declarations in a file → move them to a `types.ts` next to it | readable component files |
| Dates: `dayjs`, already a dependency | one date library |

## React

- Function components only; **one component per file**; component files
  ≲ 300 lines — split into subcomponents and `use<Component>…` hooks.
- Custom hooks live in their own file next to the component that uses them;
  helpers go in `utils.ts` or a named module, not in the component file.
- `useEffect` only to synchronise with something outside React (timers,
  subscriptions, browser APIs) — not to derive state from props.
- List `key`s come from item identity, never the index.
- **All API calls go through react-query**; use the generated hooks/types in
  `src/api/generated` when they exist. Never hand-edit generated files —
  run `pnpm generate:api`.
- No barrel files.
- Code that may need an authorization check: read
  [`src/lib/authz/README.md`](src/lib/authz/README.md).

## New UI

New screens use the shadcn/ui components in `src/components/ui` with Tailwind
(`tw:`-prefixed utilities) and the FuseScope tokens, replacing antd and
`@signozhq/ui` page by page. Read
[`src/components/ui/README.md`](src/components/ui/README.md) before adding a
component or a screen: no preflight, `fs-ui` scope, `--fs-*` variables,
`forwardRef` on React 18.

## Styling

- New screens style with Tailwind (see New UI). Other new CSS uses CSS Modules — see [`docs/css-modules-guide.md`](docs/css-modules-guide.md).
- Before styling a `@signozhq/ui` component, check its props in
  `node_modules/@signozhq/ui/dist/<component>/*.d.ts` for `className`/`style`
  support; avoid overriding its CSS variables unless required.
- No inline `style={{}}` except for values computed at runtime; no `!important`
  except to override a third-party widget without a customisation API.
- Check every new component in both light and dark themes.

## What not to introduce

- No new UI, charting, table or form libraries — `src/components/ui`
  (shadcn/ui on Radix), the legacy antd/`@signozhq/ui` and the existing
  charting stack cover these.
- No analytics, telemetry or support widgets that phone home without an explicit
  decision; existing ones (PostHog, Sentry, Appcues, Pylon) stay off by default.
- No dependencies with non-OSI licenses.

## Renames need more than one grep

When renaming a function, type, prop, string or route, search separately for:
direct references, type-level references, string literals (including
case-insensitive test regexes), dynamic imports, test files, mocks and stories.

## Before calling a change done

1. `pnpm tsgo --noEmit`
2. `pnpm lint` and `pnpm fmt` (oxlint, stylelint, oxfmt — CI runs all three)
3. The tests next to the changed files (`pnpm test <path>`), plus the full
   suite when shared code (providers, hooks, utils) changed
4. `pnpm build` when routing, config or dependencies changed
5. Fix everything they report; don't report the work as done before that.
