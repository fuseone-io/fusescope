import { useEffect } from 'react';
import { Typography } from '@signozhq/ui/typography';
import logEvent from 'api/common/logEvent';
import Spinner from 'components/Spinner';
import DashboardContainer from 'pages/DashboardPage/DashboardContainer';

import { useCollectorHealthDashboard } from './hooks/useCollectorHealthDashboard';
import styles from './CollectorHealth.module.scss';

// The FuseScope collectors' health, from the system dashboard over their own
// telemetry. Read-only: system dashboards are provisioned, not edited.
function CollectorHealth(): JSX.Element {
	const { dashboard, isLoading, isError, error, refetch } =
		useCollectorHealthDashboard();

	useEffect(() => {
		void logEvent('Collector health: Page visited', {});
	}, []);

	const renderContent = (): JSX.Element => {
		if (isLoading) {
			return <Spinner tip="Loading dashboard..." />;
		}

		if (isError || !dashboard) {
			return (
				<div className={styles.errorState}>
					<Typography.Title>Failed to load dashboard</Typography.Title>
					<Typography.Text>
						{error?.response?.data?.error?.message ?? error?.message}
					</Typography.Text>
				</div>
			);
		}

		return (
			<DashboardContainer
				dashboard={dashboard}
				refetch={refetch}
				canEditDashboardOverride={false}
			/>
		);
	};

	return (
		<div className={styles.collectorHealth} data-testid="collector-health">
			{renderContent()}
		</div>
	);
}

export default CollectorHealth;
