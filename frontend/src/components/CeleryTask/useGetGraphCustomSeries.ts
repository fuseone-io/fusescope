import { Color } from '@signozhq/design-tokens';
import { themeColors } from 'constants/theme';
import getLabelName from 'lib/getLabelName';
import { drawStyles } from 'lib/uPlotLib/utils/constants';
import { assignSeriesColors } from 'lib/uPlotLib/utils/assignSeriesColors';
import { QueryData } from 'types/api/widgets/getQuery';

import { paths } from './CeleryUtils';

interface UseGetGraphCustomSeriesProps {
	isDarkMode: boolean;
	drawStyle?: (typeof drawStyles)[keyof typeof drawStyles];
	colorMapping?: Record<string, string>;
}

const defaultColorMapping = {
	SUCCESS: Color.BG_FOREST_500,
	FAILURE: Color.BG_CHERRY_500,
	RETRY: Color.BG_AMBER_400,
};

export const useGetGraphCustomSeries = ({
	isDarkMode,
	drawStyle = 'bars',
	colorMapping = defaultColorMapping,
}: UseGetGraphCustomSeriesProps): {
	getCustomSeries: (data: QueryData[]) => uPlot.Series[];
} => {
	const getGraphSeries = (color: string, label: string): any => ({
		drawStyle,
		paths,
		lineInterpolation: 'spline',
		show: true,
		label,
		fill: `${color}90`,
		stroke: color,
		width: 2,
		spanGaps: true,
		points: {
			size: 5,
			show: false,
			stroke: color,
		},
	});

	const getCustomSeries = (data: QueryData[]): uPlot.Series[] => {
		const configurations: uPlot.Series[] = [
			{ label: 'Timestamp', stroke: 'purple' },
		];

		const labels = data.map((item) => {
			const { metric = {}, queryName = '', legend = '' } = item || {};
			return getLabelName(metric, queryName || '', legend || '');
		});
		const colors = assignSeriesColors(
			labels,
			isDarkMode ? themeColors.chartcolors : themeColors.lightModeColor,
			colorMapping,
		);

		labels.forEach((label) => {
			configurations.push(getGraphSeries(colors[label], label));
		});
		return configurations;
	};

	return { getCustomSeries };
};
