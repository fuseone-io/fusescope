import { Link } from 'react-router-dom';
import type { RumtypesGettableViewDTO } from 'api/generated/services/fuseScope.schemas';
import { formatCount } from 'lib/apm/format';
import { ApmWindow } from 'lib/apm/window';
import { formatTimeOnView } from 'lib/rum/format';
import { rumSessionsUrl } from 'lib/rum/links';
import { cn } from 'lib/utils';

import ClientBreakdown from './ClientBreakdown';
import RouteSessionsTable from './RouteSessionsTable';
import SheetSection from './SheetSection';
import SlowRequestsTable from './SlowRequestsTable';
import VitalTrendSection from './VitalTrendSection';

interface RouteDetailProps {
	applicationId: string;
	detail: RumtypesGettableViewDTO;
	release: string;
	window: ApmWindow;
}

function RouteDetail({
	applicationId,
	detail,
	release,
	window,
}: RouteDetailProps): JSX.Element {
	const kpis = [
		{ label: 'Views', value: formatCount(detail.views) },
		{ label: 'Page loads', value: formatCount(detail.pageLoads) },
		{ label: 'Route changes', value: formatCount(detail.routeChanges) },
		{ label: 'Time on view', value: formatTimeOnView(detail.medianTimeOnViewMs) },
		{
			label: 'Errors',
			value: formatCount(detail.errors),
			bad: detail.errors > 0,
		},
	];
	return (
		<>
			<div className="tw:flex tw:flex-col tw:gap-1.5">
				<dl
					data-testid="rum-route-kpis"
					className="tw:m-0 tw:grid tw:grid-cols-[repeat(auto-fit,minmax(110px,1fr))] tw:gap-px tw:overflow-hidden tw:rounded-lg tw:border tw:border-border tw:bg-border"
				>
					{kpis.map((kpi) => (
						<div
							key={kpi.label}
							className="tw:flex tw:flex-col tw:gap-1 tw:bg-surface-raised tw:px-3.5 tw:py-2.5"
						>
							<dt className="tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
								{kpi.label}
							</dt>
							<dd
								className={cn(
									'tw:m-0 tw:text-lg tw:font-semibold tw:tabular-nums',
									kpi.bad && 'tw:text-error-ink',
								)}
							>
								{kpi.value}
							</dd>
						</div>
					))}
				</dl>
				{detail.unknownLoads > 0 && (
					<span className="tw:text-xs tw:text-subtle-foreground">
						{formatCount(detail.unknownLoads)} views from SDKs before 0.2.0 are
						neither page loads nor route changes.
					</span>
				)}
			</div>
			<VitalTrendSection detail={detail} window={window} />
			<SheetSection
				title="Slowest requests"
				aside="fetch and XHR by method and URL template, slowest p75 first"
				testId="rum-route-requests"
			>
				<SlowRequestsTable requests={detail.slowRequests ?? []} />
			</SheetSection>
			<ClientBreakdown
				browsers={detail.browsers}
				operatingSystems={detail.operatingSystems}
			/>
			<SheetSection
				title="Recent sessions on this route"
				aside={
					<Link
						to={rumSessionsUrl(applicationId, { release, route: detail.route })}
						data-testid="rum-route-all-sessions"
						className="tw:text-primary! tw:hover:underline"
					>
						All sessions on {detail.route}
					</Link>
				}
				testId="rum-route-sessions"
			>
				<RouteSessionsTable
					applicationId={applicationId}
					sessions={detail.recentSessions ?? []}
				/>
			</SheetSection>
		</>
	);
}

export default RouteDetail;
