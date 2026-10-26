import { Link } from 'react-router-dom';
import {
	RumtypesGettableViewDTO,
	RumtypesPlatformDTO,
} from 'api/generated/services/fuseScope.schemas';
import { formatCount } from 'lib/apm/format';
import { ApmWindow } from 'lib/apm/window';
import { formatTimeOnView } from 'lib/rum/format';
import { rumErrorsUrl, rumSessionsUrl } from 'lib/rum/links';
import { cn } from 'lib/utils';

import { useApplicationPlatform } from '../../hooks/useApplicationPlatform';
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
	const platform = useApplicationPlatform(applicationId);
	const kpis = [
		{ label: 'Views', value: formatCount(detail.views) },
		{ label: 'Page loads', value: formatCount(detail.pageLoads) },
		{ label: 'Route changes', value: formatCount(detail.routeChanges) },
		{ label: 'Time on view', value: formatTimeOnView(detail.medianTimeOnViewMs) },
		{
			label: 'Errors',
			value: formatCount(detail.errors),
			bad: detail.errors > 0,
			to:
				detail.errors > 0
					? rumErrorsUrl(applicationId, { release, route: detail.route })
					: undefined,
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
								{kpi.to ? (
									<Link
										to={kpi.to}
										data-testid="rum-route-errors"
										title="This route’s error groups"
										className="tw:text-error-ink! tw:hover:underline"
									>
										{kpi.value}
									</Link>
								) : (
									kpi.value
								)}
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
				mobile={platform === RumtypesPlatformDTO.android}
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
