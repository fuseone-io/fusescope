import { ChartPointAction } from 'components/ChartPointPopover/types';

/** A clicked chart point. Times are unix seconds. */
export interface PanelPoint {
	timestamp: number;
	/** The bucket the point aggregates. */
	timeRange: { startTime: number; endTime: number };
	/** Labels of the clicked series, e.g. its group-by values. */
	labels: Record<string, string>;
	/** The clicked series' value at the point. */
	value?: number;
	seriesName?: string;
}

/** What a point click offers, in place of the generic drilldown. */
export interface PanelPointMenuContent {
	actions: ChartPointAction[];
	/** Footnote describing what the actions open. */
	context: string;
}

export type PanelPointMenu = (point: PanelPoint) => PanelPointMenuContent;

export interface OpenPanelPoint {
	point: PanelPoint;
	content: PanelPointMenuContent;
}
