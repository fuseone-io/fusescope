import { MouseEvent } from 'react';
import logEvent from 'api/common/logEvent';
import { Button } from 'components/ui/button';
import { fuseScopeDocsUrl } from 'constants/docs';
import ROUTES from 'constants/routes';
import history from 'lib/history';
import { ArrowRight, Server } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { LicensePlatform } from 'types/api/licensesV3/getActive';
import { ServicesList } from 'types/api/metrics/getService';
import { USER_ROLES } from 'types/roles';
import { openInNewTab } from 'utils/navigation';

import HomeEmptyState from '../components/HomeEmptyState';
import HomeWidget from '../components/HomeWidget';
import WidgetLink from '../components/WidgetLink';
import { DOCS_LINKS } from '../constants';
import ServicesTable from './ServicesTable';
import TimeIntervalMenu from './TimeIntervalMenu';

interface ServicesWidgetProps {
	/** Analytics `source` of the empty state's actions. */
	source: 'Service Traces' | 'Service Metrics';
	services: ServicesList[];
	pending: boolean;
	selectedInterval: number;
	onIntervalChange: (value: number) => void;
	onRowClick: (record: ServicesList, event: MouseEvent) => void;
}

function ServicesWidget({
	source,
	services,
	pending,
	selectedInterval,
	onIntervalChange,
	onRowClick,
}: ServicesWidgetProps): JSX.Element {
	const { user, activeLicense } = useAppContext();
	const servicesExist = services.length > 0;

	const handleGetStarted = (): void => {
		void logEvent('Homepage: Get Started clicked', { source });

		if (activeLicense && activeLicense.platform === LicensePlatform.CLOUD) {
			history.push(ROUTES.GET_STARTED_WITH_CLOUD);
		} else {
			openInNewTab(DOCS_LINKS.ADD_DATA_SOURCE);
		}
	};

	const isViewer = user?.role === USER_ROLES.VIEWER;

	return (
		<HomeWidget
			title="Services"
			testId="home-services"
			pending={pending}
			actions={
				servicesExist && (
					<>
						<TimeIntervalMenu value={selectedInterval} onChange={onIntervalChange} />
						<WidgetLink
							to={ROUTES.APPLICATION}
							label="All Services"
							onClick={(): void => {
								void logEvent('Homepage: All Services clicked', {});
							}}
						/>
					</>
				)
			}
		>
			{servicesExist ? (
				<ServicesTable services={services} onRowClick={onRowClick} />
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
								Get Started
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
