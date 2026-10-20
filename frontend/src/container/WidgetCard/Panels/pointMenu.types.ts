import { ReactNode } from 'react';

/** A clicked chart point. Times are unix seconds. */
export interface PanelPoint {
	timestamp: number;
	/** The bucket the point aggregates. */
	timeRange: { startTime: number; endTime: number };
	/** Labels of the clicked series, e.g. its group-by values. */
	labels: Record<string, string>;
}

/** Items of the context menu a point click opens, in place of the generic drilldown. */
export type PanelPointMenu = (
	point: PanelPoint,
	onClose: () => void,
) => ReactNode;
