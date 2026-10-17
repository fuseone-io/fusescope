import { useId } from 'react';
import { useParams } from 'react-router-dom';
import Panel from 'components/PageTemplate/components/Panel';
import TablePagination from 'components/PageTemplate/components/TablePagination';
import TextToolTip from 'components/TextToolTip';
import { Input } from 'components/ui/input';
import { Switch } from 'components/ui/switch';
import { fuseScopeDocsUrl } from 'constants/docs';
import Download from 'container/Download/Download';

import OperationsTable from './KeyOperations/OperationsTable';
import { useOperationTraceNavigation } from './KeyOperations/useOperationTraceNavigation';
import {
	OPERATIONS_PAGE_SIZE,
	useTopOperationsTable,
} from './KeyOperations/useTopOperationsTable';
import { TopOperationList } from './KeyOperations/types';
import { IServiceName } from './Tabs/types';
import { convertedTracesToDownloadData } from './utils';

const entryPointSpanInfo = {
	text: 'Shows the spans where requests enter new services for the first time',
	url: fuseScopeDocsUrl('/apm/services/#service-details'),
	urlText: 'Learn more about Entrypoint Spans.',
};

function TopOperationsTable({
	data,
	isLoading,
	isEntryPoint,
	onEntryPointToggle,
}: TopOperationsTableProps): JSX.Element {
	const { servicename: encodedServiceName } = useParams<IServiceName>();
	const servicename = decodeURIComponent(encodedServiceName);
	const openOperation = useOperationTraceNavigation(servicename);
	const table = useTopOperationsTable(data);
	const entryPointId = useId();

	return (
		<Panel
			testId="top-operations"
			className="tw:overflow-hidden"
			title={isEntryPoint ? 'Key Entrypoint Operations' : 'Key Operations'}
			subtitle="Top operations of this service in the selected time range"
			actions={
				<>
					<Input
						type="search"
						data-testid="top-operations-search"
						aria-label="Search operations"
						placeholder="Search operations"
						value={table.search}
						onChange={(event): void => table.onSearch(event.target.value)}
						className="tw:h-8 tw:w-48 tw:border-border tw:text-[13px]"
					/>
					<span className="tw:flex tw:items-center tw:gap-2">
						<Switch
							id={entryPointId}
							checked={isEntryPoint}
							onCheckedChange={onEntryPointToggle}
						/>
						<label
							htmlFor={entryPointId}
							className="tw:text-[13px] tw:text-muted-foreground"
						>
							Entrypoint Spans
						</label>
					</span>
					<TextToolTip
						text={entryPointSpanInfo.text}
						url={entryPointSpanInfo.url}
						useFilledIcon={false}
						urlText={entryPointSpanInfo.urlText}
					/>
					<Download
						data={convertedTracesToDownloadData(data)}
						isLoading={isLoading}
						fileName={`top-operations-${servicename}`}
					/>
				</>
			}
			bodyClassName="tw:pt-3"
		>
			<OperationsTable
				rows={table.rows}
				loading={isLoading}
				sort={table.sort}
				onSort={table.onSort}
				onOpen={openOperation}
			/>
			<TablePagination
				page={table.page}
				pageSize={OPERATIONS_PAGE_SIZE}
				total={table.total}
				onPageChange={table.setPage}
			/>
		</Panel>
	);
}

interface TopOperationsTableProps {
	data: TopOperationList[];
	isLoading: boolean;
	isEntryPoint: boolean;
	onEntryPointToggle: (checked: boolean) => void;
}

export default TopOperationsTable;
