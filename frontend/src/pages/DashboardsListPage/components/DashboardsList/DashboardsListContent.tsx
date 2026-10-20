import logEvent from 'api/common/logEvent';
import Panel from 'components/PageTemplate/components/Panel';
import NumberedTablePagination from 'components/PageTemplate/components/NumberedTablePagination';
import { cn } from 'lib/utils';
import { DashboardListEvents } from 'pages/DashboardsListPage/constants/events';

import type { DashboardListItem } from '../../utils/helpers';
import DashboardRow from '../DashboardRow/DashboardRow';
import { rowGridClass } from '../DashboardRow/rowGrid';

interface Props {
	dashboards: DashboardListItem[];
	page: number;
	pageSize: number;
	total: number;
	onPageChange: (page: number) => void;
	showUpdatedAt: boolean;
	showUpdatedBy: boolean;
	loading: boolean;
}

const HEADER_CELL =
	'tw:min-w-0 tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:uppercase tw:text-muted-foreground';

function DashboardsListContent({
	dashboards,
	page,
	pageSize,
	total,
	onPageChange,
	showUpdatedAt,
	showUpdatedBy,
	loading,
}: Props): JSX.Element {
	const showUpdated = showUpdatedAt || showUpdatedBy;
	const grid = rowGridClass(showUpdated);

	const handlePageChange = (pageNumber: number): void => {
		void logEvent(DashboardListEvents.Paginated, { pageNumber });
		onPageChange(pageNumber);
	};

	return (
		<Panel testId="dashboards-table" className="tw:overflow-hidden">
			<div className="tw:overflow-x-auto">
				<div
					role="table"
					aria-label="Dashboards"
					aria-busy={loading}
					className="tw:min-w-[760px]"
				>
					<div
						role="row"
						className={cn(
							grid,
							'fs-ui tw:min-h-9 tw:border-b tw:border-border tw:bg-surface-sunken tw:font-sans',
						)}
					>
						<span role="columnheader" className={HEADER_CELL}>
							<span className="tw:sr-only">Pinned</span>
						</span>
						<span role="columnheader" className={HEADER_CELL}>
							Name
						</span>
						<span role="columnheader" className={HEADER_CELL}>
							Tags
						</span>
						<span role="columnheader" className={HEADER_CELL}>
							Created by
						</span>
						{showUpdated && (
							<span role="columnheader" className={HEADER_CELL}>
								Last updated
							</span>
						)}
						<span role="columnheader" className={HEADER_CELL}>
							<span className="tw:sr-only">Actions</span>
						</span>
					</div>
					<div
						role="rowgroup"
						className={cn('tw:transition-opacity', loading && 'tw:opacity-60')}
					>
						{dashboards.map((dashboard, index) => (
							<DashboardRow
								key={dashboard.id}
								dashboard={dashboard}
								index={index}
								showUpdatedAt={showUpdatedAt}
								showUpdatedBy={showUpdatedBy}
							/>
						))}
					</div>
				</div>
			</div>
			<NumberedTablePagination
				page={page}
				pageSize={pageSize}
				total={total}
				itemLabel="dashboards"
				pageSizes={[pageSize]}
				onChange={handlePageChange}
			/>
		</Panel>
	);
}

export default DashboardsListContent;
