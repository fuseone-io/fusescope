import { memo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Spinner from 'components/Spinner';
import ChartPanel from 'container/MetricsApplication/components/ChartPanel';
import { GraphContainer } from 'container/MetricsApplication/styles';
import { useGetApDexSettings } from 'hooks/apDex/useGetApDexSettings';
import { FeatureKeys } from 'constants/features';
import { useNotifications } from 'hooks/useNotifications';
import { useAppContext } from 'providers/App/App';

import { IServiceName } from '../../types';
import ApDexMetrics from './ApDexMetrics';
import ApDexMetricsApplication from './ApDexMetricsApplication';
import { ApDexApplicationProps } from './types';

function ApDexApplication({
	pointMenu,
	onDragSelect,
	topLevelOperationsRoute,
	tagFilterItems,
}: ApDexApplicationProps): JSX.Element {
	const { servicename: encodedServiceName } = useParams<IServiceName>();
	const servicename = decodeURIComponent(encodedServiceName);
	const { notifications } = useNotifications();
	const { featureFlags } = useAppContext();
	const isSpanMetricEnable =
		featureFlags?.find((flag) => flag.name === FeatureKeys.USE_SPAN_METRICS)
			?.active || false;

	const { data, isLoading, error, isRefetching } =
		useGetApDexSettings(servicename);

	useEffect(() => {
		if (error) {
			notifications.error({
				message: error.getErrorCode(),
				description: error.getErrorMessage(),
			});
		}
	}, [error, notifications]);

	if (isLoading || isRefetching) {
		return (
			<ChartPanel>
				<Spinner height="40vh" tip="Loading..." />
			</ChartPanel>
		);
	}

	return (
		<ChartPanel testId="apdex">
			<GraphContainer>
				{isSpanMetricEnable ? (
					<ApDexMetricsApplication
						pointMenu={pointMenu}
						onDragSelect={onDragSelect}
						topLevelOperationsRoute={topLevelOperationsRoute}
						tagFilterItems={tagFilterItems}
						thresholdValue={data?.data[0].threshold}
					/>
				) : (
					<ApDexMetrics
						pointMenu={pointMenu}
						onDragSelect={onDragSelect}
						topLevelOperationsRoute={topLevelOperationsRoute}
						tagFilterItems={tagFilterItems}
						thresholdValue={data?.data[0].threshold}
						isSpanMetricEnable={false}
					/>
				)}
			</GraphContainer>
		</ChartPanel>
	);
}

export default memo(ApDexApplication);
