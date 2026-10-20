import { PanelPointMenu } from 'container/WidgetCard/Panels/pointMenu.types';
import { TagFilterItem } from 'types/api/queryBuilder/queryBuilderData';

export interface ApDexApplicationProps {
	pointMenu: PanelPointMenu;
	onDragSelect: (start: number, end: number) => void;
	topLevelOperationsRoute: string[];
	tagFilterItems: TagFilterItem[];
}

export interface ApDexDataSwitcherProps extends ApDexApplicationProps {
	thresholdValue?: number;
}

export interface ApDexMetricsProps extends ApDexDataSwitcherProps {
	delta?: boolean;
	metricsBuckets?: number[];
}
