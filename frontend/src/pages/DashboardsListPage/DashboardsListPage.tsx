import Spinner from 'components/Spinner';
import HeaderRightSection from 'components/HeaderRightSection/HeaderRightSection';
import { useDashboardCollectionPermissions } from 'hooks/dashboards/useDashboardCollectionPermissions';
import DashboardsList from './components/DashboardsList/DashboardsList';

function DashboardsListPage(): JSX.Element {
	// Resolved before the list mounts, so no control renders enabled-then-disabled.
	const { isLoading } = useDashboardCollectionPermissions();

	return (
		<div
			data-testid="dashboards-list-page"
			className="tw:flex tw:min-h-0 tw:w-full tw:flex-1 tw:flex-col tw:bg-background tw:text-foreground"
		>
			{isLoading ? (
				<Spinner tip="Loading dashboards..." />
			) : (
				<DashboardsList
					headerActions={
						<HeaderRightSection
							enableAnnouncements={false}
							enableShare
							enableFeedback
						/>
					}
				/>
			)}
		</div>
	);
}

export default DashboardsListPage;
