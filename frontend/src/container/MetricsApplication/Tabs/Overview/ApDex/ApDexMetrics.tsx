import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import TextToolTip from 'components/TextToolTip';
import {
	apDexToolTipText,
	apDexToolTipUrl,
	apDexToolTipUrlText,
} from 'constants/apDex';
import ServiceChart from 'container/MetricsApplication/components/ServiceChart';
import { APDEX_SERIES } from 'container/MetricsApplication/components/serviceChartSeries';
import { GraphTitle } from 'container/MetricsApplication/constant';
import {
	apDexMetricsQueryBuilderQueries,
	apDexTracesQueryBuilderQueries,
} from 'container/MetricsApplication/MetricsPageQueries/OverviewQueries';

import { IServiceName } from '../../types';
import { apdexWidget } from './apdexWidget';
import { ApDexMetricsProps } from './types';

function ApDexMetrics({
	delta,
	metricsBuckets,
	thresholdValue,
	onDragSelect,
	tagFilterItems,
	topLevelOperationsRoute,
	pointMenu,
	isSpanMetricEnable = true,
	compare = false,
	loading = false,
}: ApDexMetricsProps): JSX.Element {
	const { servicename: encodedServiceName } = useParams<IServiceName>();
	const servicename = decodeURIComponent(encodedServiceName);
	const apDexMetricsWidget = useMemo(
		() =>
			apdexWidget(
				isSpanMetricEnable
					? apDexMetricsQueryBuilderQueries({
							servicename,
							tagFilterItems,
							topLevelOperationsRoute,
							threashold: thresholdValue || 0,
							delta: delta || false,
							metricsBuckets: metricsBuckets || [],
						})
					: apDexTracesQueryBuilderQueries({
							servicename,
							tagFilterItems,
							topLevelOperationsRoute,
							threashold: thresholdValue || 0,
						}),
			),
		[
			delta,
			isSpanMetricEnable,
			metricsBuckets,
			servicename,
			tagFilterItems,
			thresholdValue,
			topLevelOperationsRoute,
		],
	);

	const isQueryEnabled =
		topLevelOperationsRoute.length > 0 &&
		(!isSpanMetricEnable ||
			(!!metricsBuckets && metricsBuckets?.length > 0 && delta !== undefined));

	return (
		<ServiceChart
			title={GraphTitle.APDEX}
			unit={thresholdValue ? `T = ${thresholdValue * 1000} ms` : undefined}
			titleAddon={
				<TextToolTip
					text={apDexToolTipText}
					url={apDexToolTipUrl}
					useFilledIcon={false}
					urlText={apDexToolTipUrlText}
				/>
			}
			testId="apdex"
			widget={apDexMetricsWidget}
			series={APDEX_SERIES}
			compare={compare}
			pointMenu={pointMenu}
			onDragSelect={onDragSelect}
			isQueryEnabled={isQueryEnabled}
			loading={loading}
		/>
	);
}

ApDexMetrics.defaultProps = {
	delta: undefined,
	le: undefined,
	isSpanMetricEnable: true,
	compare: false,
	loading: false,
};

export default ApDexMetrics;
