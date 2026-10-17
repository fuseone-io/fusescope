# AppSidebar

FuseScope's main navigation, built on the shadcn `Sidebar` (`components/ui/sidebar`).
`AppLayout` renders `AppSidebarProvider` as its layout row and `AppSidebar` inside it.

## Behaviour

- Expanded (labels) or collapsed to an icon rail with tooltips. It changes only on
  request: the app header's toggle, the rail edge, Ctrl/⌘+B or Shift+B. Hover never
  expands it.
- The state is the `sidenav_pinned` user preference (expanded ⇔ pinned), mirrored in
  localStorage until preferences load. The shadcn cookie is not used.
- Items sit in groups (`NAV_GROUPS`); Integrations, Noz, Help & Support, Settings and
  the user menu sit in the footer. Users can pin items to a Shortcuts group
  (`nav_shortcuts` preference).
- Below 768px the sidebar is a sheet opened from the same toggle.

## Structure

| Path | Purpose |
| --- | --- |
| `AppSidebar.tsx` | The navigation. |
| `AppSidebarProvider.tsx` | `SidebarProvider` bound to the preference, plus Shift+B. |
| `components/` | Brand header, nav item, group, help and user menus. |
| `hooks/` | Preference, navigation, shortcuts, visibility and menu data. |
| `constants.tsx` | Nav groups and items. |
| `types.ts` | Nav item and menu types. |
| `utils.ts` | Initials, role label, modifier-aware navigation. |
| `stories/` | `Components/App Sidebar`, light/dark × expanded/collapsed. |
| `__tests__/` | Behaviour tests. |
