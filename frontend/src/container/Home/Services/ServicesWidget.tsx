import logEvent from 'api/common/logEvent';
import { Button } from 'components/ui/button';
import { fuseScopeDocsUrl } from 'constants/docs';
import ROUTES from 'constants/routes';
import history from 'lib/history';
import { ArrowRight, Server } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { ServiceRow } from 'pages/Services/components/ServicesList/serviceRows';
import { USER_ROLES } from 'types/roles';

import HomeEmptyState from '../components/HomeEmptyState';
import HomeWidget from '../components/HomeWidget';
import WidgetLink from '../components/WidgetLink';
import ServicesTable from './ServicesTable';
import TimeIntervalMenu from './TimeIntervalMenu';

interface ServicesWidgetProps {
	/** Analytics `source` of the empty state's actions. */
	source: 'Service Traces' | 'Service Metrics';
	rows: ServiceRow[];
	pending: boolean;
	selectedInterval: number;
	onIntervalChange: (value: number) => void;
}

function ServicesWidget({
	source,
	rows,
	pending,
	selectedInterval,
	onIntervalChange,
}: ServicesWidgetProps): JSX.Element {
	const { user } = useAppContext();
	const servicesExist = rows.length > 0;

	const handleGetStarted = (): void => {
		void logEvent('Homepage: Get Started clicked', { source });

		history.push(ROUTES.GET_STARTED);
	};

	const isViewer = user?.role === USER_ROLES.VIEWER;

	return (
		<HomeWidget
			title="Services"
			subtitle={
				servicesExist ? 'Highlighted first, then by error rate' : undefined
			}
			testId="home-services"
			pending={pending}
			actions={
				servicesExist && (
					<>
						<TimeIntervalMenu value={selectedInterval} onChange={onIntervalChange} />
						<WidgetLink
							to={ROUTES.APPLICATION}
							label="All services"
							onClick={(): void => {
								void logEvent('Homepage: All Services clicked', {});
							}}
						/>
					</>
				)
			}
		>
			{servicesExist ? (
				<ServicesTable rows={rows} />
			) : (
				<HomeEmptyState
					icon={<Server />}
					title="You are not sending traces yet."
					description="Start sending traces to see your services."
					action={
						isViewer ? undefined : (
							<Button
								variant="outline"
								size="sm"
								onClick={handleGetStarted}
								className="tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!"
							>
								Get started
								<ArrowRight aria-hidden="true" />
							</Button>
						)
					}
					onLearnMore={
						isViewer
							? undefined
							: (): void => {
									void logEvent('Homepage: Learn more clicked', { source });
									window.open(
										fuseScopeDocsUrl('/sending-data/instrumentation/'),
										'_blank',
									);
								}
					}
				/>
			)}
		</HomeWidget>
	);
}

export default ServicesWidget;
