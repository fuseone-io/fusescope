import { PanelPointMenu } from 'container/WidgetCard/Panels/pointMenu.types';
import { TagFilterItem } from 'types/api/queryBuilder/queryBuilderData';

export interface ApDexApplicationProps {
	pointMenu: PanelPointMenu;
	onDragSelect: (start: number, end: number) => void;
	topLevelOperationsRoute: string[];
	tagFilterItems: TagFilterItem[];
	/** Draws the previous period dashed. */
	compare?: boolean;
}

export interface ApDexDataSwitcherProps extends ApDexApplicationProps {
	thresholdValue?: number;
	/** The settings or the bucket metadata are still loading. */
	loading?: boolean;
}

export interface ApDexMetricsProps extends ApDexDataSwitcherProps {
	delta?: boolean;
	metricsBuckets?: number[];
	/** Off, apdex is counted from the service's top-level spans. */
	isSpanMetricEnable?: boolean;
}
