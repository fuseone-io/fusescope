import { MouseEvent, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import { useListDashboardsForUserV2 } from 'api/generated/services/dashboard';
import {
	DashboardtypesListOrderDTO,
	DashboardtypesListSortDTO,
} from 'api/generated/services/fuseScope.schemas';
import TagChip from 'components/PageTemplate/components/TagChip';
import { Button } from 'components/ui/button';
import { fuseScopeDocsUrl } from 'constants/docs';
import ROUTES from 'constants/routes';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { LayoutDashboard, Plus } from 'lucide-react';
import { resolveDashboardImage } from 'pages/DashboardPage/DashboardContainer/dashboardIcons';
import { useAppContext } from 'providers/App/App';
import { USER_ROLES } from 'types/roles';
import { openInNewTab } from 'utils/navigation';

import HomeEmptyState from '../components/HomeEmptyState';
import HomeListItem from '../components/HomeListItem';
import HomeWidget from '../components/HomeWidget';
import WidgetLink from '../components/WidgetLink';
import { timeAgo } from '../utils';

const VISIBLE_TAGS = 2;

// The five most-recent dashboards from the V2 list API.
interface RecentDashboard {
	id: string;
	title: string;
	tags: string[];
	image: string;
	updatedAt?: string;
}

export default function Dashboards({
	onUpdateChecklistDoneItem,
	loadingUserPreferences,
}: {
	onUpdateChecklistDoneItem: (itemKey: string) => void;
	loadingUserPreferences: boolean;
}): JSX.Element {
	const { safeNavigate } = useSafeNavigate();
	const { user } = useAppContext();

	const {
		data: dashboardsList,
		isLoading: isDashboardListLoading,
		isError: isDashboardListError,
	} = useListDashboardsForUserV2({
		sort: DashboardtypesListSortDTO.updated_at,
		order: DashboardtypesListOrderDTO.desc,
		limit: 5,
		offset: 0,
	});

	const sortedDashboards = useMemo<RecentDashboard[]>(
		() =>
			(dashboardsList?.data?.dashboards ?? []).map((d) => ({
				id: d.id,
				title: d.spec?.display?.name ?? d.name,
				tags: (d.tags ?? []).map((t) => (t.value ? `${t.key}:${t.value}` : t.key)),
				image: resolveDashboardImage(d.image),
				updatedAt: d.updatedAt,
			})),
		[dashboardsList],
	);

	useEffect(() => {
		if (sortedDashboards.length > 0 && !loadingUserPreferences) {
			onUpdateChecklistDoneItem('SETUP_DASHBOARDS');
		}
	}, [sortedDashboards, onUpdateChecklistDoneItem, loadingUserPreferences]);

	const isViewer = user?.role === USER_ROLES.VIEWER;
	const dashboardsExist = sortedDashboards.length > 0;

	const openDashboard = (
		dashboard: RecentDashboard,
		event: MouseEvent<HTMLElement>,
	): void => {
		event.stopPropagation();
		const link = `${ROUTES.ALL_DASHBOARD}/${dashboard.id}`;
		void logEvent('Homepage: Dashboard clicked', {
			dashboardId: dashboard.id,
			dashboardName: dashboard.title,
		});
		if (event.metaKey || event.ctrlKey) {
			openInNewTab(link);
		} else {
			safeNavigate(link);
		}
	};

	return (
		<HomeWidget
			title="Dashboards"
			subtitle={dashboardsExist ? 'Recently updated' : undefined}
			testId="home-dashboards"
			pending={isDashboardListLoading || isDashboardListError}
			actions={
				dashboardsExist && (
					<WidgetLink
						to={ROUTES.ALL_DASHBOARD}
						label="All dashboards"
						onClick={(): void => {
							void logEvent('Homepage: All dashboards clicked', {});
						}}
					/>
				)
			}
		>
			{dashboardsExist ? (
				<ul className="fs-ui tw:font-sans">
					{sortedDashboards.slice(0, 5).map((dashboard) => (
						<HomeListItem
							key={dashboard.id}
							icon={
								<img src={dashboard.image} alt="" className="tw:block tw:size-4" />
							}
							label={dashboard.title}
							onOpen={(event): void => openDashboard(dashboard, event)}
							trailing={
								<>
									{dashboard.tags.slice(0, VISIBLE_TAGS).map((tag) => (
										<TagChip key={tag} className="tw:hidden tw:sm:inline-flex">
											{tag}
										</TagChip>
									))}
									{dashboard.tags.length > VISIBLE_TAGS && (
										<span className="tw:hidden tw:text-xs tw:text-subtle-foreground tw:sm:inline">
											+{dashboard.tags.length - VISIBLE_TAGS}
										</span>
									)}
									<span className="tw:ml-1 tw:text-xs tw:whitespace-nowrap tw:text-subtle-foreground tw:tabular-nums">
										{timeAgo(dashboard.updatedAt)}
									</span>
								</>
							}
						/>
					))}
				</ul>
			) : (
				<HomeEmptyState
					icon={<LayoutDashboard />}
					title="You don’t have any dashboards yet."
					description={isViewer ? undefined : 'Create a dashboard to get started'}
					action={
						isViewer ? undefined : (
							<Button asChild variant="outline" size="sm">
								<Link
									to={ROUTES.ALL_DASHBOARD}
									onClick={(): void => {
										void logEvent('Homepage: Create dashboard clicked', {});
									}}
									className="tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!"
								>
									<Plus aria-hidden="true" />
									New Dashboard
								</Link>
							</Button>
						)
					}
					onLearnMore={
						isViewer
							? undefined
							: (): void => {
									void logEvent('Homepage: Learn more clicked', {
										source: 'Dashboards',
									});
									window.open(fuseScopeDocsUrl('/dashboards/dashboards/'), '_blank');
								}
					}
				/>
			)}
		</HomeWidget>
	);
}
