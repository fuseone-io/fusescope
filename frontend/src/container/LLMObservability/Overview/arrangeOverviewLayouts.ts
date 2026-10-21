import type {
	DashboardGridItemDTO,
	DashboardtypesLayoutDTO,
} from 'api/generated/services/fuseScope.schemas';

/** Grid rows of a KPI tile in the compact strip (98px). */
export const KPI_ROW_HEIGHT = 2;

export const TOOLS_AND_TRACE_TITLE = 'Tool calls & per-trace usage';

const COST_TITLE = 'Cost & tokens';
const LATENCY_TITLE = 'LLM latency & errors';
const TOOLS_TITLE = 'Tool calls';
const PER_TRACE_TITLE = 'Per-trace usage';

const titleOf = (layout: DashboardtypesLayoutDTO): string | undefined =>
	layout.spec.display?.title;

const bottomOf = (items: DashboardGridItemDTO[]): number =>
	items.reduce(
		(max, entry) => Math.max(max, (entry.y ?? 0) + (entry.height ?? 0)),
		0,
	);

function compactKpis(layout: DashboardtypesLayoutDTO): DashboardtypesLayoutDTO {
	return {
		...layout,
		spec: {
			...layout.spec,
			items: (layout.spec.items ?? []).map((entry) => ({
				...entry,
				height: KPI_ROW_HEIGHT,
			})),
		},
	};
}

function mergeToolsAndPerTrace(
	tools: DashboardtypesLayoutDTO,
	perTrace: DashboardtypesLayoutDTO,
): DashboardtypesLayoutDTO {
	const toolItems = tools.spec.items ?? [];
	const offset = bottomOf(toolItems);
	return {
		...tools,
		spec: {
			...tools.spec,
			display: { ...tools.spec.display, title: TOOLS_AND_TRACE_TITLE },
			items: [
				...toolItems,
				...(perTrace.spec.items ?? []).map((entry) => ({
					...entry,
					y: (entry.y ?? 0) + offset,
				})),
			],
		},
	};
}

/**
 * Orders the `ai-o11y-overview` system dashboard as the page reads it: the KPI
 * row as a compact strip, cost, latency, then tools with per-trace usage in
 * one section. Sections it does not know keep their order after these.
 */
export function arrangeOverviewLayouts(
	layouts: DashboardtypesLayoutDTO[],
): DashboardtypesLayoutDTO[] {
	const kpis = layouts.find((layout) => !titleOf(layout));
	const byTitle = (title: string): DashboardtypesLayoutDTO | undefined =>
		layouts.find((layout) => titleOf(layout) === title);

	const cost = byTitle(COST_TITLE);
	const latency = byTitle(LATENCY_TITLE);
	const tools = byTitle(TOOLS_TITLE);
	const perTrace = byTitle(PER_TRACE_TITLE);

	const known = new Set(
		[kpis, cost, latency, tools, perTrace].filter(
			(layout): layout is DashboardtypesLayoutDTO => layout !== undefined,
		),
	);
	if (known.size === 0) {
		return layouts;
	}

	const toolsAndTrace =
		tools && perTrace ? [mergeToolsAndPerTrace(tools, perTrace)] : [];
	const lone = tools && perTrace ? [] : [tools ?? perTrace];

	return [
		kpis && compactKpis(kpis),
		cost,
		latency,
		...toolsAndTrace,
		...lone,
		...layouts.filter((layout) => !known.has(layout)),
	].filter((layout): layout is DashboardtypesLayoutDTO => layout !== undefined);
}
