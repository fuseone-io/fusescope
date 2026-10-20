import { memo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Spinner from 'components/Spinner';
import ChartPanel from 'container/MetricsApplication/components/ChartPanel';
import { GraphContainer } from 'container/MetricsApplication/styles';
import { useGetApDexSettings } from 'hooks/apDex/useGetApDexSettings';
import { useNotifications } from 'hooks/useNotifications';

import { IServiceName } from '../../types';
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
				<ApDexMetricsApplication
					pointMenu={pointMenu}
					onDragSelect={onDragSelect}
					topLevelOperationsRoute={topLevelOperationsRoute}
					tagFilterItems={tagFilterItems}
					thresholdValue={data?.data[0].threshold}
				/>
			</GraphContainer>
		</ChartPanel>
	);
}

export default memo(ApDexApplication);
