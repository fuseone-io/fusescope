import {
	DashboardGridItemDTO,
	DashboardtypesLayoutDTO,
	DashboardtypesLayoutEnvelopeGithubComPersesSpecGoDashboardGridLayoutSpecDTOKind as LayoutKind,
} from 'api/generated/services/fuseScope.schemas';

import {
	arrangeOverviewLayouts,
	KPI_ROW_HEIGHT,
	kpiPanelIds,
	TOOLS_AND_TRACE_TITLE,
} from '../arrangeOverviewLayouts';

const item = (
	id: string,
	x: number,
	y: number,
	width = 6,
	height = 6,
): DashboardGridItemDTO => ({
	x,
	y,
	width,
	height,
	content: { $ref: `#/spec/panels/${id}` },
});

const grid = (
	items: DashboardGridItemDTO[],
	title?: string,
): DashboardtypesLayoutDTO => ({
	kind: LayoutKind.Grid,
	spec: { items, ...(title ? { display: { title } } : {}) },
});

const KPIS = grid([item('cost', 0, 0, 2, 3), item('tokens', 2, 0, 2, 3)]);
const COST = grid([item('cost-chart', 0, 0)], 'Cost & tokens');
const PER_TRACE = grid(
	[item('trace-a', 0, 0), item('trace-b', 6, 0), item('trace-c', 0, 6)],
	'Per-trace usage',
);
const LATENCY = grid([item('latency', 0, 0)], 'LLM latency & errors');
const TOOLS = grid(
	[item('tool-a', 0, 0), item('tool-b', 0, 6, 4, 6), item('tool-c', 4, 6, 4, 4)],
	'Tool calls',
);

const titles = (layouts: DashboardtypesLayoutDTO[]): (string | undefined)[] =>
	layouts.map((layout) => layout.spec.display?.title);

const refs = (layout: DashboardtypesLayoutDTO): (string | undefined)[] =>
	(layout.spec.items ?? []).map((entry) => entry.content?.$ref);

describe('arrangeOverviewLayouts', () => {
	const arranged = arrangeOverviewLayouts([
		KPIS,
		COST,
		PER_TRACE,
		LATENCY,
		TOOLS,
	]);

	it.each([
		[0, undefined],
		[1, 'Cost & tokens'],
		[2, 'LLM latency & errors'],
		[3, TOOLS_AND_TRACE_TITLE],
	])('puts section %i as %s', (index, title) => {
		expect(titles(arranged)[index]).toBe(title);
	});

	it('returns four sections', () => {
		expect(arranged).toHaveLength(4);
	});

	it('compacts the KPI row and keeps its columns', () => {
		expect(arranged[0].spec.items).toStrictEqual([
			{ ...item('cost', 0, 0, 2, KPI_ROW_HEIGHT) },
			{ ...item('tokens', 2, 0, 2, KPI_ROW_HEIGHT) },
		]);
	});

	it('puts the tool panels first, then the per-trace panels below them', () => {
		const merged = arranged[3];
		expect(refs(merged)).toStrictEqual([
			'#/spec/panels/tool-a',
			'#/spec/panels/tool-b',
			'#/spec/panels/tool-c',
			'#/spec/panels/trace-a',
			'#/spec/panels/trace-b',
			'#/spec/panels/trace-c',
		]);
		// The tools grid ends at y=12 (tool-b: 6 + 6).
		expect(
			(merged.spec.items ?? []).slice(3).map((entry) => entry.y),
		).toStrictEqual([12, 12, 18]);
	});

	it('does not mutate its input', () => {
		expect(KPIS.spec.items?.[0].height).toBe(3);
		expect(TOOLS.spec.display?.title).toBe('Tool calls');
	});

	it.each([
		['no layouts', []],
		['an unknown dashboard', [grid([item('x', 0, 0)], 'Something else')]],
	])('leaves %s untouched', (_name, layouts) => {
		expect(arrangeOverviewLayouts(layouts)).toStrictEqual(layouts);
	});

	it('keeps sections it does not know after the known ones', () => {
		const extra = grid([item('x', 0, 0)], 'Extra');
		expect(titles(arrangeOverviewLayouts([extra, COST, KPIS]))).toStrictEqual([
			undefined,
			'Cost & tokens',
			'Extra',
		]);
	});

	it('keeps a lone per-trace or tools section under its own title', () => {
		expect(titles(arrangeOverviewLayouts([KPIS, PER_TRACE]))).toStrictEqual([
			undefined,
			'Per-trace usage',
		]);
		expect(titles(arrangeOverviewLayouts([KPIS, TOOLS]))).toStrictEqual([
			undefined,
			'Tool calls',
		]);
	});
});

describe('kpiPanelIds', () => {
	it.each([
		['the untitled KPI row', [COST, KPIS, LATENCY], ['cost', 'tokens']],
		['no KPI row', [COST, LATENCY], []],
	])('returns the panels of %s', (_name, layouts, expected) => {
		expect(kpiPanelIds(layouts)).toStrictEqual(expected);
	});
});
