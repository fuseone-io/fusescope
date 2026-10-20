import { MouseEvent, ReactNode, useMemo } from 'react';
import { generatePath } from 'react-router-dom';
import {
	useGetMetricAlerts,
	useGetMetricDashboardsV2,
} from 'api/generated/services/metrics';
import { Skeleton } from 'components/ui/skeleton';
import { QueryParams } from 'constants/query';
import ROUTES from 'constants/routes';
import { Bell, LayoutDashboard } from 'lucide-react';
import { openInNewTab } from 'utils/navigation';
import { pluralize } from 'utils/pluralize';

import { DashboardsAndAlertsPopoverProps } from './types';

interface UsedInItem {
	id: string;
	name: string;
	href: string;
	kind: string;
	icon: ReactNode;
}

function UsedInLink({ item }: { item: UsedInItem }): JSX.Element {
	return (
		<a
			href={item.href}
			onClick={(event: MouseEvent<HTMLAnchorElement>): void => {
				event.preventDefault();
				openInNewTab(item.href);
			}}
			className="tw:flex tw:min-h-9 tw:items-center tw:gap-2.5 tw:rounded-lg tw:px-3 tw:text-[13px] tw:text-foreground! tw:no-underline! tw:transition-colors tw:hover:bg-muted!"
		>
			<span aria-hidden="true" className="tw:text-subtle-foreground">
				{item.icon}
			</span>
			<span className="tw:min-w-0 tw:flex-1 tw:truncate">{item.name}</span>
			<span className="tw:text-xs tw:text-subtle-foreground">{item.kind}</span>
		</a>
	);
}

/** "Used in": the dashboards and alert rules that query the metric. */
function DashboardsAndAlertsPopover({
	metricName,
}: DashboardsAndAlertsPopoverProps): JSX.Element | null {
	const {
		data: alertsData,
		isLoading: isLoadingAlerts,
		isError: isErrorAlerts,
	} = useGetMetricAlerts(
		{
			metricName,
		},
		{
			query: {
				enabled: !!metricName,
			},
		},
	);

	const {
		data: dashboardsData,
		isLoading: isLoadingDashboards,
		isError: isErrorDashboards,
	} = useGetMetricDashboardsV2(
		{
			metricName,
		},
		{
			query: {
				enabled: !!metricName,
			},
		},
	);

	const alerts = useMemo(() => alertsData?.data.alerts ?? [], [alertsData]);

	const dashboards = useMemo(() => {
		const currentDashboards = dashboardsData?.data.dashboards ?? [];
		// The API returns one entry per referencing panel, so a dashboard repeats
		// once per panel that uses the metric.
		return currentDashboards.filter(
			(dashboard, index, self) =>
				index === self.findIndex((t) => t.dashboardId === dashboard.dashboardId),
		);
	}, [dashboardsData]);

	const items = useMemo(
		(): UsedInItem[] => [
			...dashboards.map((dashboard) => ({
				id: `dashboard-${dashboard.dashboardId}`,
				name: dashboard.dashboardName || dashboard.dashboardId,
				href: generatePath(ROUTES.DASHBOARD, {
					dashboardId: dashboard.dashboardId,
				}),
				kind: 'Dashboard',
				icon: <LayoutDashboard size={16} />,
			})),
			...alerts.map((alert) => ({
				id: `alert-${alert.alertId}`,
				name: alert.alertName || alert.alertId,
				href: `${ROUTES.ALERT_OVERVIEW}?${QueryParams.ruleId}=${alert.alertId}`,
				kind: 'Alert rule',
				icon: <Bell size={16} />,
			})),
		],
		[alerts, dashboards],
	);

	if (isLoadingAlerts || isLoadingDashboards) {
		return (
			<div className="fs-ui" data-testid="metric-used-in-loading">
				<Skeleton className="tw:h-[52px] tw:w-full tw:rounded-xl" />
			</div>
		);
	}

	if (!items.length || (isErrorAlerts && isErrorDashboards)) {
		return null;
	}

	const summary = [
		dashboards.length ? pluralize(dashboards.length, 'dashboard') : null,
		alerts.length ? pluralize(alerts.length, 'alert rule') : null,
	]
		.filter(Boolean)
		.join(' — ');

	return (
		<section
			aria-labelledby="metric-used-in-title"
			data-testid="metric-used-in"
			className="fs-ui tw:flex tw:flex-col tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:font-sans tw:text-foreground"
		>
			<div className="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-border tw:px-4 tw:py-3">
				<h3 id="metric-used-in-title" className="tw:text-sm tw:font-semibold">
					Used in
				</h3>
				<span className="tw:text-xs tw:text-subtle-foreground">{summary}</span>
			</div>
			<div className="tw:flex tw:flex-col tw:px-1 tw:py-1.5">
				{items.map((item) => (
					<UsedInLink key={item.id} item={item} />
				))}
			</div>
		</section>
	);
}

export default DashboardsAndAlertsPopover;
