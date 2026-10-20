import { useId, useState } from 'react';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import TablePagination from 'components/PageTemplate/components/TablePagination';
import { Input } from 'components/ui/input';
import { Switch } from 'components/ui/switch';
import Download from 'container/Download/Download';
import { useEndpoints } from 'container/MetricsApplication/hooks/useEndpoints';
import { EndpointGroupBy } from 'lib/apm/serviceRequests';
import { useApmSource } from 'lib/apm/useApmSource';
import { Search } from 'lucide-react';

import EndpointsTable from './EndpointsTable';
import { useEndpointNavigation } from './useEndpointNavigation';
import { ENDPOINTS_PAGE_SIZE, useEndpointsTable } from './useEndpointsTable';
import { endpointsToDownloadData, GROUP_LABEL, GROUP_SUBTITLE } from './utils';

interface EndpointsProps {
	servicename: string;
}

const GROUP_OPTIONS: EndpointGroupBy[] = ['name', 'http.route', 'rpc.method'];

/** Every operation of the service, or its spans by route or RPC method. */
function Endpoints({ servicename }: EndpointsProps): JSX.Element {
	const source = useApmSource();
	const [groupBy, setGroupBy] = useState<EndpointGroupBy>('name');
	const [entryPoint, setEntryPoint] = useState(false);
	const entryPointId = useId();
	const { rows, isLoading } = useEndpoints(servicename, { groupBy, entryPoint });
	const table = useEndpointsTable(rows);
	const openRow = useEndpointNavigation(servicename, groupBy);
	const attributeGroups = source === 'traces';

	return (
		<div className="tw:flex tw:flex-col tw:gap-4">
			<div className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:gap-x-4 tw:gap-y-2 tw:font-sans">
				<span className="tw:flex tw:items-center tw:gap-2">
					<span className="tw:text-[13px] tw:text-muted-foreground">Group by</span>
					<SegmentedControl
						label="Group endpoints by"
						options={(attributeGroups ? GROUP_OPTIONS : ['name' as const]).map(
							(value) => ({
								value,
								label: GROUP_LABEL[value],
								testId: `endpoints-group-${value}`,
							}),
						)}
						value={groupBy}
						onChange={(value): void => {
							setGroupBy(value);
							table.setPage(1);
						}}
					/>
				</span>
				<span className="tw:flex tw:items-center tw:gap-2">
					<Switch
						id={entryPointId}
						checked={entryPoint}
						onCheckedChange={setEntryPoint}
						data-testid="endpoints-entry-points"
					/>
					<label htmlFor={entryPointId} className="tw:text-[13px]">
						Entry points only
					</label>
				</span>
				<div className="tw:relative tw:w-full tw:max-w-[360px] tw:flex-[1_1_260px]">
					<Search
						aria-hidden="true"
						className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-3 tw:size-4 tw:-translate-y-1/2 tw:text-subtle-foreground"
					/>
					<Input
						type="search"
						data-testid="top-operations-search"
						aria-label="Search operations"
						placeholder="Search operations"
						value={table.search}
						onChange={(event): void => table.onSearch(event.target.value)}
						className="tw:h-9 tw:bg-surface-raised tw:pl-9 tw:dark:bg-surface-raised"
					/>
				</div>
				<div className="tw:ml-auto">
					<Download
						data={endpointsToDownloadData(rows, groupBy)}
						isLoading={isLoading}
						fileName={`endpoints-${servicename}`}
					/>
				</div>
			</div>
			<ContentPanel
				testId="top-operations"
				title={`Endpoints by ${GROUP_LABEL[groupBy] === 'Operation' ? 'operation' : GROUP_LABEL[groupBy]}`}
				subtitle={GROUP_SUBTITLE[groupBy]}
				actions={
					<span className="tw:text-xs tw:text-muted-foreground tw:tabular-nums">
						{`${table.total} rows`}
					</span>
				}
				footer={
					<>
						<span>Select a row to open its traces.</span>
						<span>
							% time spent = rate × average duration, as a share of the service total
						</span>
					</>
				}
				divided
			>
				<div className="tw:overflow-x-auto">
					<EndpointsTable
						keyLabel={GROUP_LABEL[groupBy]}
						rows={table.rows}
						loading={isLoading}
						sort={table.sort}
						onSort={table.onSort}
						onOpen={openRow}
					/>
				</div>
				<TablePagination
					page={table.page}
					pageSize={ENDPOINTS_PAGE_SIZE}
					total={table.total}
					onPageChange={table.setPage}
				/>
			</ContentPanel>
		</div>
	);
}

export default Endpoints;
