import { useState } from 'react';
import Panel from 'components/PageTemplate/components/Panel';
import TablePagination from 'components/PageTemplate/components/TablePagination';
import UserAvatarCell from 'components/PageTemplate/components/UserAvatarCell';
import { pageOf } from 'components/PageTemplate/utils';
import { Skeleton } from 'components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import { getRandomColor } from 'container/ExplorerOptions/utils';
import { CalendarClock } from 'lucide-react';
import { useTimezone } from 'providers/Timezone';
import { ViewProps } from 'types/api/saveViews/types';

import ViewRowActions from './ViewRowActions';

const PAGE_SIZE = 5;
const SKELETON_ROWS = ['a', 'b', 'c'];

interface ViewsTableProps {
	views: ViewProps[];
	loading: boolean;
	canEdit: boolean;
	onEdit: (view: ViewProps, color: string) => void;
	onOpen: (view: ViewProps) => void;
	onDelete: (view: ViewProps) => void;
}

function viewColor(view: ViewProps): string {
	const extraData = view.extraData !== '' ? JSON.parse(view.extraData) : '';
	return extraData !== '' ? extraData.color : getRandomColor();
}

function ViewsTable({
	views,
	loading,
	canEdit,
	onEdit,
	onOpen,
	onDelete,
}: ViewsTableProps): JSX.Element {
	const [page, setPage] = useState(1);
	const { formatTimezoneAdjustedTimestamp } = useTimezone();
	const rows = pageOf(views, page, PAGE_SIZE);

	return (
		<Panel testId="saved-views-table" className="tw:overflow-hidden">
			<Table className="tw:min-w-[720px] tw:table-fixed" aria-label="Saved views">
				<TableHeader className="tw:bg-surface-sunken">
					<TableRow>
						<TableHead className="tw:px-4">View</TableHead>
						<TableHead className="tw:w-[220px] tw:px-4">Created by</TableHead>
						<TableHead className="tw:w-[300px] tw:px-4">Created</TableHead>
						<TableHead className="tw:w-[112px] tw:px-4 tw:text-right">
							Actions
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{loading &&
						SKELETON_ROWS.map((row) => (
							<TableRow key={row} data-testid="saved-view-row-loading">
								<TableCell colSpan={4} className="tw:h-[52px] tw:px-4">
									<Skeleton className="tw:h-5 tw:bg-muted" />
								</TableCell>
							</TableRow>
						))}
					{!loading && views.length === 0 && (
						<TableRow className="tw:hover:bg-transparent">
							<TableCell
								colSpan={4}
								className="tw:h-24 tw:text-center tw:text-[13px] tw:text-muted-foreground"
							>
								No data
							</TableCell>
						</TableRow>
					)}
					{!loading &&
						rows.map((view) => {
							const color = viewColor(view);
							return (
								<TableRow key={view.id} data-testid="saved-view-row">
									<TableCell className="tw:h-[52px] tw:max-w-0 tw:px-4">
										<span className="tw:flex tw:min-w-0 tw:items-center tw:gap-2.5">
											<span
												aria-hidden="true"
												className="tw:size-2 tw:flex-none tw:rounded-full"
												style={{
													background: color,
													boxShadow: `0px 0px 6px 0px ${color}`,
												}}
											/>
											<span className="tw:truncate tw:font-medium">{view.name}</span>
										</span>
									</TableCell>
									<TableCell className="tw:max-w-0 tw:px-4">
										<UserAvatarCell email={view.createdBy} />
									</TableCell>
									<TableCell className="tw:px-4">
										<span className="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-muted-foreground">
											<CalendarClock
												aria-hidden="true"
												className="tw:size-3.5 tw:flex-none tw:text-subtle-foreground"
											/>
											<span className="tw:font-mono tw:tabular-nums">
												{formatTimezoneAdjustedTimestamp(
													view.createdAt,
													DATE_TIME_FORMATS.DASH_TIME_DATE,
												)}
											</span>
										</span>
									</TableCell>
									<TableCell className="tw:px-4 tw:text-right">
										<ViewRowActions
											canEdit={canEdit}
											onEdit={(): void => onEdit(view, color)}
											onOpen={(): void => onOpen(view)}
											onDelete={(): void => onDelete(view)}
										/>
									</TableCell>
								</TableRow>
							);
						})}
				</TableBody>
			</Table>
			{!loading && (
				<TablePagination
					page={page}
					pageSize={PAGE_SIZE}
					total={views.length}
					onPageChange={setPage}
				/>
			)}
		</Panel>
	);
}

export default ViewsTable;
