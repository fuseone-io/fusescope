import { memo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
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
	compare = false,
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

	const loading = isLoading || isRefetching;
	const props = {
		pointMenu,
		onDragSelect,
		topLevelOperationsRoute,
		tagFilterItems,
		compare,
		thresholdValue: data?.data[0].threshold,
	};

	return isSpanMetricEnable && !loading ? (
		<ApDexMetricsApplication {...props} />
	) : (
		<ApDexMetrics {...props} loading={loading} isSpanMetricEnable={false} />
	);
}

export default memo(ApDexApplication);
