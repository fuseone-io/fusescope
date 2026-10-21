import { ReactNode, useState } from 'react';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import TabCountBadge from 'components/PageTemplate/components/TabCountBadge';
import TablePagination from 'components/PageTemplate/components/TablePagination';
import { pageOf } from 'components/PageTemplate/utils';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { cn } from 'lib/utils';

import { DATA_COLLECTED_PAGE_SIZE } from './constants';

export interface DataCollectedColumn<Row> {
	key: keyof Row & string;
	label: string;
	mono?: boolean;
}

interface DataCollectedTableProps<Row> {
	title: string;
	icon: ReactNode;
	columns: DataCollectedColumn<Row>[];
	rows: Row[];
	testId: string;
}

/** One signal's collected fields, 20 to a page. */
function DataCollectedTable<Row extends object>({
	title,
	icon,
	columns,
	rows,
	testId,
}: DataCollectedTableProps<Row>): JSX.Element {
	const [page, setPage] = useState(1);

	return (
		<ContentPanel
			testId={testId}
			title={
				<>
					{icon}
					{title}
					<TabCountBadge count={rows.length} />
				</>
			}
			divided
		>
			<Table>
				<TableHeader>
					<TableRow>
						{columns.map((column) => (
							<TableHead key={column.key}>{column.label}</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.length === 0 && (
						<TableRow>
							<TableCell
								colSpan={columns.length}
								className="tw:text-center tw:text-[13px] tw:text-muted-foreground"
							>
								No data
							</TableCell>
						</TableRow>
					)}
					{pageOf(rows, page, DATA_COLLECTED_PAGE_SIZE).map((row) => (
						<TableRow
							key={columns.map((column) => String(row[column.key])).join('|')}
						>
							{columns.map((column) => (
								<TableCell
									key={column.key}
									className={cn(
										'tw:text-[13px]',
										column.mono && 'tw:font-mono tw:text-xs',
									)}
								>
									{String(row[column.key] ?? '')}
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
			<TablePagination
				page={page}
				pageSize={DATA_COLLECTED_PAGE_SIZE}
				total={rows.length}
				onPageChange={setPage}
			/>
		</ContentPanel>
	);
}

export default DataCollectedTable;
