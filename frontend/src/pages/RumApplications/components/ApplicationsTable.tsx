import { Skeleton } from 'components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';

import { ApplicationRow as Row } from '../types';
import ApplicationRow from './ApplicationRow';

interface ApplicationsTableProps {
	rows: Row[];
	metricsLoading: boolean;
	onOpenSettings: (applicationId: string) => void;
}

const RIGHT = 'tw:text-right';
const COLUMN_COUNT = 9;
const SKELETON_ROWS = ['a', 'b', 'c'];

function ApplicationsTable({
	rows,
	metricsLoading,
	onOpenSettings,
}: ApplicationsTableProps): JSX.Element {
	return (
		<Table className="tw:min-w-[1100px]">
			<TableHeader>
				<TableRow>
					<TableHead className="tw:w-[22%]">Application</TableHead>
					<TableHead className={RIGHT}>Sessions</TableHead>
					<TableHead className={RIGHT}>Error rate</TableHead>
					<TableHead title="Largest Contentful Paint, p75">LCP p75</TableHead>
					<TableHead title="Interaction to Next Paint, p75">INP p75</TableHead>
					<TableHead title="Cumulative Layout Shift, p75">CLS p75</TableHead>
					<TableHead className="tw:w-[200px]">SDK</TableHead>
					<TableHead className="tw:w-[160px]">Last seen</TableHead>
					<TableHead className="tw:w-12">
						<span className="tw:sr-only">Actions</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{metricsLoading && rows.length === 0
					? SKELETON_ROWS.map((key) => (
							<TableRow key={key}>
								<TableCell colSpan={COLUMN_COUNT}>
									<Skeleton className="tw:h-5 tw:bg-muted" />
								</TableCell>
							</TableRow>
						))
					: rows.map((row) => (
							<ApplicationRow
								key={row.application.id}
								row={row}
								onOpenSettings={onOpenSettings}
							/>
						))}
			</TableBody>
		</Table>
	);
}

export default ApplicationsTable;
