import { EditorView } from '@codemirror/view';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
	findSuggestion,
	openKeySuggestions,
	typeFilter,
} from 'components/QueryBuilderV2/QueryV2/QuerySearch/stories/__story_mockdata__/querySearch.play';
import { expect, screen, waitFor, within } from 'storybook/test';

import { storyMocks } from '@/storybook/controls/defineStoryMocks';
import type { PageStoryArgs } from '@/storybook/runtime/resolveStory';

import { metricsMocks, saveUnit } from './MetricsExplorerPage.stories.mocks';
import MetricsExplorerPage from '../MetricsExplorerPage';

type MetricsArgs = PageStoryArgs<typeof metricsMocks>;

const pageStory = storyMocks(metricsMocks, { layout: 'app' });

/**
 * Metrics: the summary treemap, the explorer over `query_range`, the metric drawer
 * with its attributes and related assets, saved views, and the volume control
 * rules.
 *
 * Route: `/metrics-explorer/*`, the tab control picks which.
 */
const meta = {
	title: 'Pages/Metrics/Explorer',
	tags: ['play'],
	component: MetricsExplorerPage,
	...pageStory,
	parameters: { ...pageStory.parameters },
} satisfies Meta<MetricsArgs>;

export default meta;

type Story = StoryObj<MetricsArgs>;

/**
 * The Summary tab on a workspace ingesting a full catalogue of metrics: the
 * proportion view sizing each metric against the others, and the list view
 * below it paging ten metrics at a time with their type, unit and cardinality.
 */
export const Default: Story = {};

/**
 * The metric details panel, opened from a row: the metric's metadata, the
 * cardinality highlights, the dashboards and alerts it feeds, and its attribute
 * keys with the values seen in the window.
 */
export const MetricDetails: Story = {
	args: { drawer: 'details' },
};

/**
 * The inspect modal, which plots the raw time series behind one gauge before any
 * time or space aggregation is applied.
 */
export const Inspect: Story = {
	args: { drawer: 'inspect' },
};

/**
 * The Volume Control tab: what the workspace ingests against what the reduction
 * rules retain, and the rule per metric that decides it.
 */
export const VolumeControl: Story = {
	args: { tab: 'volume-control' },
};

/**
 * The Explorer tab plotting one metric, with the query builder above the chart
 * and the saved-view actions in the toolbar.
 */
export const Explorer: Story = {
	args: { tab: 'explorer' },
};

/** The Views tab, where the saved views the explorer offers are managed. */
export const SavedViews: Story = {
	args: { tab: 'views' },
	play: async ({ canvasElement }): Promise<void> => {
		const table = await within(canvasElement).findByTestId(
			'saved-views-table',
			{},
			{ timeout: 10000 },
		);
		const [deleteView] = await within(table).findAllByTestId('delete-view');
		await expect(deleteView).toBeVisible();
		const scroller = table.querySelector('table')?.parentElement as HTMLElement;
		// The row actions fit their column: no sideways scroll.
		await waitFor(() =>
			expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth),
		);
	},
};

/**
 * A fresh workspace: nothing ingested in the window, so the Summary tab drops
 * both views for its onboarding state and nothing is saved or reduced yet.
 */
export const NoMetrics: Story = {
	args: { metrics: 0, treemap: 0, rules: 0, savedViews: 0 },
};

/** The Summary tab mid-query, with the cancel action the toolbar offers. */
export const Loading: Story = {
	args: { dataState: 'loading' },
};

/**
 * The metric details panel's highlights with their tooltips held open: the
 * exact sample count behind the abbreviated one and the timestamp the last data
 * point arrived at.
 */
export const Tooltips: Story = {
	args: { tooltipsOpen: true, drawer: 'details' },
};

/**
 * The metric details panel's "Used in" list: every dashboard and alert rule
 * that charts this metric, each a link out to it.
 */
export const MetricDetailsUsedIn: Story = {
	args: { drawer: 'details' },
	play: async (): Promise<void> => {
		const usedIn = await screen.findByTestId(
			'metric-used-in',
			{},
			{ timeout: 10000 },
		);
		await within(usedIn).findAllByRole('link');
	},
};

/** The summary's metric search focused: the attributes metrics can be found by. */
export const FilterKeySuggestions: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		await openKeySuggestions(canvasElement, 'k8s.cluster.name');
	},
};

/** The metric search on an attribute and an operator: the values it holds. */
export const FilterValueSuggestions: Story = {
	play: async ({ canvasElement }): Promise<void> => {
		await typeFilter(canvasElement, 'service.name = ');
		await findSuggestion(canvasElement, 'checkout');
	},
};

/**
 * "Set the selected unit as the metric unit?" answered Yes: the toast raised
 * once the metadata write lands. Set Unit save to `error` for the failure.
 */
export const UnitSavedToast: Story = {
	args: { tab: 'explorer', metricUnit: 'unset' },
	play: async ({ canvasElement, args }): Promise<void> => {
		await saveUnit(
			canvasElement,
			args.unitSave === 'success'
				? 'Unit saved successfully'
				: 'Failed to save unit',
		);
	},
};

/** The same save with the metadata write failing. */
export const UnitSaveErrorToast: Story = {
	args: { tab: 'explorer', metricUnit: 'unset', unitSave: 'error' },
	// The deliberate 500 is the state under test.
	parameters: { allowConsoleErrors: true },
	play: async ({ canvasElement }): Promise<void> => {
		await saveUnit(canvasElement, 'Failed to save unit');
	},
};

const LONG_FILTER =
	"exporter = 'logs' AND host.name CONTAINS 'signoz-host' OR le CONTAINS '1000' OR os.type ILIKE 'linux' OR server.port != '8888' AND service.instance.id CONTAINS 'b2c4e6f8-1a3c-4e5f-9a7b-0c1d2e3f4a5b'";

/**
 * A where clause too long for one line grows its field, line by line, and
 * pushes the sections below it down instead of spilling over them.
 */
const growWhere = async (canvasElement: HTMLElement): Promise<void> => {
	const card = await within(canvasElement).findByTestId(
		'query-card-A',
		{},
		{ timeout: 15000 },
	);
	const where = await waitFor(() => {
		const box = card.querySelector<HTMLElement>('.where');
		const content = box?.querySelector<HTMLElement>('.cm-content');
		const view = content && EditorView.findFromDOM(content);
		expect(view).toBeTruthy();
		return { box: box as HTMLElement, view: view as EditorView };
	});
	const single = where.box.getBoundingClientRect().height;

	where.view.dispatch({
		changes: { from: 0, to: where.view.state.doc.length, insert: LONG_FILTER },
	});

	await waitFor(() => {
		const box = where.box.getBoundingClientRect();
		const label = where.box.parentElement
			?.querySelector('.flabel')
			?.getBoundingClientRect();
		const next = card.querySelector('.esec')?.getBoundingClientRect();
		const lines = where.box.querySelectorAll('.cm-line');
		const text = lines[lines.length - 1]?.getBoundingClientRect();

		expect(single).toBe(32);
		expect(box.height).toBeGreaterThan(single);
		expect(label?.bottom ?? 0).toBeLessThanOrEqual(box.top);
		expect(text?.bottom ?? Infinity).toBeLessThanOrEqual(box.bottom);
		expect(box.bottom).toBeLessThanOrEqual(next?.top ?? 0);
	});
};

/** The explorer's where clause holding a long filter, in the dark theme. */
export const ExplorerLongFilter: Story = {
	args: { tab: 'explorer' },
	play: async ({ canvasElement }): Promise<void> => growWhere(canvasElement),
};

/** The same long filter in the light theme. */
export const ExplorerLongFilterLight: Story = {
	args: { tab: 'explorer' },
	globals: { theme: 'light' },
	play: async ({ canvasElement }): Promise<void> => growWhere(canvasElement),
};
