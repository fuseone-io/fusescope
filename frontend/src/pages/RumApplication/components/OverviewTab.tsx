import { ApmWindow } from 'lib/apm/window';
import { ApplicationOverview, SessionRequest } from 'lib/rum/overviewTypes';

import OverviewKpis from './OverviewKpis';
import RecentErrorsPanel from './RecentErrorsPanel';
import RecentSessionsPanel from './RecentSessionsPanel';
import TopRoutesPanel from './TopRoutesPanel';

interface OverviewTabProps {
	overview: ApplicationOverview;
	loading: boolean;
	filter: string;
	window: ApmWindow;
	sessionErrors: Record<string, number>;
	sessionRequests: Record<string, SessionRequest>;
}

function OverviewTab({
	overview,
	loading,
	filter,
	window,
	sessionErrors,
	sessionRequests,
}: OverviewTabProps): JSX.Element {
	return (
		<div className="tw:flex tw:flex-col tw:gap-4" data-testid="rum-overview">
			<OverviewKpis overview={overview} />
			<TopRoutesPanel
				routes={overview.routes}
				routeCount={overview.routeCount}
				loading={loading}
			/>
			<RecentErrorsPanel
				errors={overview.errors}
				filter={filter}
				window={window}
				loading={loading}
			/>
			<RecentSessionsPanel
				sessions={overview.sessions}
				errors={sessionErrors}
				requests={sessionRequests}
				filter={filter}
				window={window}
				loading={loading}
			/>
		</div>
	);
}

export default OverviewTab;
