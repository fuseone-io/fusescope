import { SectionKind } from 'pages/DashboardPage/DashboardContainer/Panels/types/sections';

/** Visualization starts open; list sections open when they already hold items. */
export function isSectionInitiallyOpen(
	kind: SectionKind,
	value: unknown,
): boolean {
	if (kind === SectionKind.Visualization) {
		return true;
	}
	return Array.isArray(value) && value.length > 0;
}
