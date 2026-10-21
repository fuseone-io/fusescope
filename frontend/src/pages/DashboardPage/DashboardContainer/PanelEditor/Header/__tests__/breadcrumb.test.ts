import type { DashboardSection } from '../../../utils';
import { type PanelEditorCrumbsInput, panelEditorCrumbs } from '../breadcrumb';

function section(
	layoutIndex: number,
	title: string | undefined,
	panelIds: string[],
): DashboardSection {
	return {
		id: `sec-${layoutIndex}`,
		layoutIndex,
		title,
		repeatVariable: undefined,
		items: panelIds.map((id) => ({
			id,
			x: 0,
			y: 0,
			width: 6,
			height: 6,
			panel: undefined,
		})),
	};
}

const sections = [
	section(0, undefined, ['p0']),
	section(1, 'Golden signals', ['p1', 'p2']),
];

describe('panelEditorCrumbs', () => {
	it.each<
		[string, PanelEditorCrumbsInput, ReturnType<typeof panelEditorCrumbs>]
	>([
		[
			'a panel in a titled section',
			{
				dashboardName: 'HotROD',
				sections,
				panelId: 'p2',
				panelTitle: 'Request rate',
				isNew: false,
			},
			{ dashboard: 'HotROD', section: 'Golden signals', panel: 'Request rate' },
		],
		[
			'a panel at the root has no section crumb',
			{
				dashboardName: 'HotROD',
				sections,
				panelId: 'p0',
				panelTitle: 'Apdex',
				isNew: false,
			},
			{ dashboard: 'HotROD', section: undefined, panel: 'Apdex' },
		],
		[
			'an untitled panel',
			{
				dashboardName: 'HotROD',
				sections,
				panelId: 'p1',
				panelTitle: '  ',
				isNew: false,
			},
			{ dashboard: 'HotROD', section: 'Golden signals', panel: 'Untitled panel' },
		],
		[
			'a new panel added to a section',
			{
				dashboardName: 'HotROD',
				sections,
				panelId: 'new',
				panelTitle: '',
				isNew: true,
				target: { type: 'section', layoutIndex: 1 },
			},
			{ dashboard: 'HotROD', section: 'Golden signals', panel: 'New panel' },
		],
		[
			'a new panel in a section still to be created',
			{
				dashboardName: 'HotROD',
				sections,
				panelId: 'new',
				panelTitle: 'Errors',
				isNew: true,
				target: { type: 'newSection', title: 'Errors by service' },
			},
			{ dashboard: 'HotROD', section: 'Errors by service', panel: 'Errors' },
		],
		[
			'a new panel at the root',
			{
				dashboardName: '',
				sections,
				panelId: 'new',
				panelTitle: '',
				isNew: true,
				target: { type: 'root' },
			},
			{ dashboard: 'Dashboard', section: undefined, panel: 'New panel' },
		],
	])('%s', (_name, input, expected) => {
		expect(panelEditorCrumbs(input)).toStrictEqual(expected);
	});
});
