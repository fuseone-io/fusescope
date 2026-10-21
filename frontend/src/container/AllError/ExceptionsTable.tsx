import { Link } from 'react-router-dom';
import { Skeleton } from 'components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import ROUTES from 'constants/routes';
import { formatCount } from 'lib/apm/format';
import { useServiceKinds } from 'lib/apm/useServiceKinds';
import { useTimezone } from 'providers/Timezone';
import { Exception } from 'types/api/errors/getAll';

import { EXCEPTION_COLUMNS, SEEN_FORMAT, SKELETON_ROWS } from './constants';
import ExceptionServiceCell from './ExceptionServiceCell';
import ExceptionsHeadCell from './ExceptionsHeadCell';
import { AllErrorsParams } from './useAllErrorsParams';
import { getNanoSeconds } from './utils';

interface ExceptionsTableProps {
	rows: Exception[];
	loading: boolean;
	params: AllErrorsParams;
}

function ExceptionsTable({
	rows,
	loading,
	params,
}: ExceptionsTableProps): JSX.Element {
	const { formatTimezoneAdjustedTimestamp } = useTimezone();
	const serviceIdentity = useServiceKinds();
	const formatSeen = (value: string): string =>
		formatTimezoneAdjustedTimestamp(value, SEEN_FORMAT);
	const formatFull = (value: string): string =>
		formatTimezoneAdjustedTimestamp(value, DATE_TIME_FORMATS.UK_DATETIME_SECONDS);

	const filterValues = {
		exceptionType: params.exceptionType,
		serviceName: params.serviceName,
	};

	return (
		<Table className="tw:min-w-[760px] tw:table-fixed tw:[&_td]:px-3 tw:[&_td]:py-2.5 tw:[&_th]:px-3 tw:[&_tr>*:first-child]:pl-5 tw:[&_tr>*:last-child]:pr-5">
			<TableHeader className="tw:bg-surface-sunken">
				<TableRow>
					{EXCEPTION_COLUMNS.map((column) => (
						<ExceptionsHeadCell
							key={column.key}
							column={column}
							order={params.order}
							orderParam={params.orderParam}
							filterValues={filterValues}
							onSort={params.onSort}
							onFilter={params.onFilter}
						/>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{loading &&
					SKELETON_ROWS.map((row) => (
						<TableRow key={row} data-testid="exception-row-loading">
							<TableCell colSpan={EXCEPTION_COLUMNS.length}>
								<Skeleton className="tw:h-5 tw:bg-muted" />
							</TableCell>
						</TableRow>
					))}
				{!loading && rows.length === 0 && (
					<TableRow>
						<TableCell
							colSpan={EXCEPTION_COLUMNS.length}
							className="tw:h-24 tw:text-center tw:text-muted-foreground"
						>
							No exceptions in this time range.
						</TableCell>
					</TableRow>
				)}
				{!loading &&
					rows.map((record) => (
						<TableRow key={record.groupID} data-testid="exception-row">
							<TableCell className="tw:truncate">
								<Link
									to={`${ROUTES.ERROR_DETAIL}?groupId=${
										record.groupID
									}&timestamp=${getNanoSeconds(record.lastSeen)}`}
									title={record.exceptionType}
									className="tw:font-mono tw:text-xs tw:font-medium tw:text-primary! tw:hover:underline"
								>
									{record.exceptionType}
								</Link>
							</TableCell>
							<TableCell
								title={record.exceptionMessage}
								className="tw:truncate tw:font-mono tw:text-xs tw:text-muted-foreground"
							>
								{record.exceptionMessage}
							</TableCell>
							<TableCell
								title={record.exceptionCount.toLocaleString('en-US')}
								className="tw:text-right tw:font-medium tw:tabular-nums"
							>
								{formatCount(record.exceptionCount)}
							</TableCell>
							<TableCell
								title={formatFull(record.lastSeen)}
								className="tw:text-xs tw:tabular-nums"
							>
								{formatSeen(record.lastSeen)}
							</TableCell>
							<TableCell
								title={formatFull(record.firstSeen)}
								className="tw:text-xs tw:text-muted-foreground tw:tabular-nums"
							>
								{formatSeen(record.firstSeen)}
							</TableCell>
							<TableCell>
								<ExceptionServiceCell
									serviceName={record.serviceName}
									identity={serviceIdentity(record.serviceName)}
								/>
							</TableCell>
						</TableRow>
					))}
			</TableBody>
		</Table>
	);
}

export default ExceptionsTable;
