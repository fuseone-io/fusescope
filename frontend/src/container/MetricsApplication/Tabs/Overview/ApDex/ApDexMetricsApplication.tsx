import { useParams } from 'react-router-dom';
import { useGetMetricMeta } from 'hooks/apDex/useGetMetricMeta';
import useErrorNotification from 'hooks/useErrorNotification';

import { WidgetKeys } from '../../../constant';
import { IServiceName } from '../../types';
import ApDexMetrics from './ApDexMetrics';
import { ApDexDataSwitcherProps } from './types';

function ApDexMetricsApplication({
	pointMenu,
	onDragSelect,
	tagFilterItems,
	thresholdValue,
	topLevelOperationsRoute,
	compare,
}: ApDexDataSwitcherProps): JSX.Element {
	const { servicename: encodedServiceName } = useParams<IServiceName>();
	const servicename = decodeURIComponent(encodedServiceName);

	const { data, isLoading, error } = useGetMetricMeta(
		WidgetKeys.SignozLatencyBucket,
		servicename,
	);
	useErrorNotification(error);

	return (
		<ApDexMetrics
			loading={isLoading}
			compare={compare}
			topLevelOperationsRoute={topLevelOperationsRoute}
			pointMenu={pointMenu}
			delta={data?.data.delta}
			metricsBuckets={data?.data.le || []}
			onDragSelect={onDragSelect}
			tagFilterItems={tagFilterItems}
			thresholdValue={thresholdValue}
		/>
	);
}

export default ApDexMetricsApplication;
