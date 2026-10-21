import { useMemo, useState } from 'react';
import { QueryFunctionContext, useQueries, useQuery } from 'react-query';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { Skeleton } from 'components/ui/skeleton';
import { Switch } from 'components/ui/switch';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { ChevronRight } from 'lucide-react';
import { getQueryRangeV5 } from 'api/v5/queryRange/getQueryRange';
import { MetricRangePayloadV5, ScalarData } from 'api/v5/v5';
import { useNavigateToExplorer } from 'components/CeleryTask/useNavigateToExplorer';
import { withErrorBoundary } from 'components/ErrorBoundaryHOC';
import { ENTITY_VERSION_V5 } from 'constants/app';
import { REACT_QUERY_KEY } from 'constants/reactQueryKeys';
import {
	END_POINT_DETAILS_QUERY_KEYS_ARRAY,
	formatTopErrorsDataForTable,
	TopErrorsTableRowData,
	getEndPointDetailsQueryPayload,
	getTopErrorsCoRelationQueryFilters,
	getTopErrorsQueryPayload,
} from 'container/ApiMonitoring/utils';
import { GetMetricQueryRange } from 'lib/dashboard/getQueryResults';
import { SuccessResponse, SuccessResponseV2 } from 'types/api';
import { MetricRangePayloadProps } from 'types/api/metrics/getQueryRange';
import { DataTypes } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { IBuilderQuery } from 'types/api/queryBuilder/queryBuilderData';
import { DataSource } from 'types/common/queryBuilder';

import EndPointsDropDown from './components/EndPointsDropDown';
import ErrorState from './components/ErrorState';
import { SPAN_ATTRIBUTES } from './constants';

function TopErrors({
	domainName,
	timeRange,
	initialFilters,
}: {
	domainName: string;
	timeRange: {
		startTime: number;
		endTime: number;
	};
	initialFilters: IBuilderQuery['filters'];
}): JSX.Element {
	const { startTime: minTime, endTime: maxTime } = timeRange;

	const [endPointName, setSelectedEndPointName] = useState<string>('');
	const [showStatusCodeErrors, setShowStatusCodeErrors] =
		useState<boolean>(true);

	const queryPayload = useMemo(
		() =>
			getTopErrorsQueryPayload(
				domainName,
				minTime,
				maxTime,
				{
					items: endPointName
						? [
								// Remove any existing http_url filters from initialFilters to avoid duplicates
								...(initialFilters?.items?.filter(
									(item) => item.key?.key !== SPAN_ATTRIBUTES.HTTP_URL,
								) || []),
								{
									id: '92b8a1c1',
									key: {
										dataType: DataTypes.String,
										key: SPAN_ATTRIBUTES.HTTP_URL,
										type: 'tag',
									},
									op: '=',
									value: endPointName,
								},
							]
						: [...(initialFilters?.items || [])],
					op: 'AND',
				},
				showStatusCodeErrors,
			),
		[
			domainName,
			endPointName,
			minTime,
			maxTime,
			initialFilters,
			showStatusCodeErrors,
		],
	);

	const {
		data: topErrorsData,
		isLoading,
		isRefetching,
		isError,
		refetch,
	} = useQuery({
		queryKey: [
			REACT_QUERY_KEY.GET_TOP_ERRORS_BY_DOMAIN,
			queryPayload,
			ENTITY_VERSION_V5,
			showStatusCodeErrors,
		],
		queryFn: ({
			signal,
		}: QueryFunctionContext): Promise<SuccessResponseV2<MetricRangePayloadV5>> =>
			getQueryRangeV5(queryPayload, ENTITY_VERSION_V5, signal),
		enabled: !!queryPayload,
		staleTime: 0,
		cacheTime: 0,
	});

	const formattedTopErrorsData = useMemo(
		() =>
			formatTopErrorsDataForTable(
				topErrorsData?.data?.data?.data?.results[0] as ScalarData,
			),
		[topErrorsData],
	);

	const endPointDropDownQueryPayload = useMemo(
		() => [
			getEndPointDetailsQueryPayload(domainName, minTime, maxTime, {
				items: [],
				op: 'AND',
			})[2],
		],
		[domainName, minTime, maxTime],
	);

	const endPointDropDownDataQueries = useQueries(
		endPointDropDownQueryPayload.map((payload) => ({
			queryKey: [
				END_POINT_DETAILS_QUERY_KEYS_ARRAY[2],
				payload,
				ENTITY_VERSION_V5,
			],
			queryFn: (): Promise<SuccessResponse<MetricRangePayloadProps>> =>
				GetMetricQueryRange(payload, ENTITY_VERSION_V5),
			enabled: !!payload,
			staleTime: 60 * 1000,
		})),
	);

	const [endPointDropDownDataQuery] = useMemo(
		() => [endPointDropDownDataQueries[0]],
		[endPointDropDownDataQueries],
	);

	const navigateToExplorer = useNavigateToExplorer();

	if (isError) {
		return (
			<div className="all-endpoints-error-state-wrapper">
				<ErrorState refetch={refetch} />
			</div>
		);
	}

	const loading = isLoading || isRefetching;
	const openTraces = (record: TopErrorsTableRowData): void => {
		const filters = getTopErrorsCoRelationQueryFilters(
			domainName,
			record.endpointName,
			record.statusCode,
		);
		navigateToExplorer({
			filters: [...(filters?.items || [])],
			dataSource: DataSource.TRACES,
			startTime: minTime,
			endTime: maxTime,
			shouldResolveQuery: true,
		});
	};

	return (
		<div className="all-endpoints-container tw:flex tw:flex-col tw:gap-4">
			<div className="top-errors-dropdown-container tw:flex tw:flex-wrap tw:items-center tw:gap-x-4 tw:gap-y-2">
				<div className="endpoint-details-filters-container-dropdown fs-ui tw:flex tw:h-9 tw:w-[340px] tw:max-w-full tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-input tw:bg-surface-raised tw:pl-3 tw:font-sans">
					<span className="tw:text-xs tw:text-subtle-foreground">Endpoint</span>
					<div className="tw:min-w-0 tw:flex-1">
						<EndPointsDropDown
							selectedEndPointName={endPointName}
							setSelectedEndPointName={setSelectedEndPointName}
							endPointDropDownDataQuery={endPointDropDownDataQuery}
							parentContainerDiv=".endpoint-details-filters-container"
						/>
					</div>
				</div>
				<label
					htmlFor="top-errors-status-message"
					className="fs-ui tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-2 tw:font-sans tw:text-[13px] tw:text-muted-foreground"
					title="When on, only errors that carry a status message are listed. When off, every error is."
				>
					<Switch
						id="top-errors-status-message"
						checked={showStatusCodeErrors}
						onCheckedChange={setShowStatusCodeErrors}
					/>
					Status Message Exists
				</label>
			</div>

			<ContentPanel
				testId="top-errors"
				title={showStatusCodeErrors ? 'Errors with Status Message' : 'All Errors'}
				subtitle="The ten most frequent errors by endpoint, status code and status message. Select a row to open matching traces."
				divided
			>
				<Table aria-label="Top errors" className="tw:min-w-[760px]">
					<TableHeader className="tw:bg-surface-sunken">
						<TableRow>
							<TableHead className="tw:w-[30%]">Endpoint</TableHead>
							<TableHead className="tw:w-28">Status code</TableHead>
							<TableHead>Status message</TableHead>
							<TableHead className="tw:w-24 tw:text-right">Count</TableHead>
							<TableHead className="tw:w-10">
								<span className="tw:sr-only">Open traces</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading &&
							['a', 'b', 'c'].map((key) => (
								<TableRow key={key} data-testid="top-error-row-loading">
									<TableCell colSpan={5}>
										<Skeleton className="tw:h-5 tw:bg-muted" />
									</TableCell>
								</TableRow>
							))}
						{!loading && formattedTopErrorsData.length === 0 && (
							<TableRow className="tw:hover:bg-transparent">
								<TableCell
									colSpan={5}
									className="tw:h-24 tw:text-center tw:text-[13px] tw:text-muted-foreground"
								>
									{showStatusCodeErrors
										? 'Please disable "Status Message Exists" toggle to see all errors'
										: 'This query had no results. Edit your query and try again!'}
								</TableCell>
							</TableRow>
						)}
						{!loading &&
							formattedTopErrorsData.map((record) => (
								<TableRow
									key={record.key}
									className="tw:h-12 tw:cursor-pointer"
									onClick={(): void => openTraces(record)}
								>
									<TableCell className="tw:max-w-0">
										<span className="tw:block tw:truncate tw:font-mono tw:font-medium">
											{record.endpointName}
										</span>
									</TableCell>
									<TableCell>
										<StatusBadge tone="error" className="tw:font-mono">
											{record.statusCode}
										</StatusBadge>
									</TableCell>
									<TableCell className="tw:max-w-0">
										<span
											className="tw:block tw:truncate tw:text-muted-foreground"
											title={record.statusMessage}
										>
											{record.statusMessage}
										</span>
									</TableCell>
									<TableCell className="tw:text-right tw:tabular-nums">
										{record.count}
									</TableCell>
									<TableCell>
										<ChevronRight
											aria-hidden="true"
											className="tw:size-4 tw:text-subtle-foreground"
										/>
									</TableCell>
								</TableRow>
							))}
					</TableBody>
				</Table>
			</ContentPanel>
		</div>
	);
}

export default withErrorBoundary(TopErrors);
