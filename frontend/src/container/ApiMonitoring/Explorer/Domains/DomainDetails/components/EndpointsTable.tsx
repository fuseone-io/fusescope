import { useMemo } from 'react';
import { useQuery } from 'react-query';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { Skeleton } from 'components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { ENTITY_VERSION_V5 } from 'constants/app';
import { PANEL_TYPES } from 'constants/queryBuilder';
import { REACT_QUERY_KEY } from 'constants/reactQueryKeys';
import { formatMs } from 'container/ApiMonitoring/domainList';
import {
	extractPortAndEndpoint,
	getLastUsedRelativeTime,
} from 'container/ApiMonitoring/utils';
import { formatCount } from 'lib/apm/format';
import { GetMetricQueryRange } from 'lib/dashboard/getQueryResults';
import { Widgets } from 'types/api/widgets/widget';

import ErrorRateBar from '../../../../components/ErrorRateBar';
import { SPAN_ATTRIBUTES } from '../constants';
import ErrorState from './ErrorState';

type EndpointRowData = Record<string, string | number | undefined>;

interface EndpointsTableProps {
	widget: Widgets;
	timeRange: { startTime: number; endTime: number };
	onRowClick: (row: EndpointRowData) => void;
}

const VALUE_KEYS = ['A', 'B', 'C', 'D', 'F1'];
const SKELETON_ROWS = ['a', 'b', 'c'];
const NUMBER = 'tw:text-right tw:tabular-nums';

const toNumber = (value: unknown): number | undefined => {
	if (value === undefined || value === null || value === 'n/a' || value === '') {
		return undefined;
	}
	const number = Number(value);
	return Number.isFinite(number) ? number : undefined;
};

function lastUsed(value: unknown): string {
	if (value === undefined || value === 'n/a' || value === '') {
		return '—';
	}
	const time = new Date(String(value)).getTime();
	return Number.isNaN(time) ? '—' : getLastUsedRelativeTime(time);
}

/** The domain's endpoints with calls, p99, last use and errors; a row opens its stats. */
function EndpointsTable({
	widget,
	timeRange,
	onRowClick,
}: EndpointsTableProps): JSX.Element {
	const payload = useMemo(
		() => ({
			selectedTime: widget.timePreferance,
			graphType: PANEL_TYPES.TABLE,
			query: widget.query,
			variables: {},
			formatForWeb: true,
			start: timeRange.startTime,
			end: timeRange.endTime,
		}),
		[widget, timeRange],
	);

	const { data, isLoading, isFetching, isError, refetch } = useQuery({
		queryKey: [
			REACT_QUERY_KEY.GET_DOMAIN_ENDPOINTS_TABLE,
			payload,
			ENTITY_VERSION_V5,
		],
		queryFn: () => GetMetricQueryRange(payload, ENTITY_VERSION_V5),
	});

	const { rows, groupColumns } = useMemo(() => {
		const table = data?.payload?.data?.result?.[0]?.table;
		const columns = table?.columns ?? [];
		return {
			rows: ((table?.rows ?? []) as { data: EndpointRowData }[])
				.map((row) => row.data)
				.sort((a, b) => (toNumber(b.A) ?? 0) - (toNumber(a.A) ?? 0)),
			groupColumns: columns
				.filter((column) => String(column.isValueColumn) !== 'true')
				.map((column) => column.name)
				.filter(
					(name) =>
						name !== SPAN_ATTRIBUTES.HTTP_URL &&
						name !== SPAN_ATTRIBUTES.SERVER_PORT &&
						!VALUE_KEYS.includes(name),
				),
		};
	}, [data]);

	if (isError) {
		return <ErrorState refetch={refetch} />;
	}

	const loading = isLoading || isFetching;
	const columnCount = 5 + groupColumns.length;

	return (
		<ContentPanel
			testId="domain-endpoints-table"
			title="Endpoints"
			subtitle="Paths called on this domain, without host or port. Select one to see its stats."
			divided
		>
			<Table aria-label="Endpoints" className="tw:min-w-[820px]">
				<TableHeader className="tw:bg-surface-sunken">
					<TableRow>
						<TableHead className="tw:w-[34%]">Endpoint</TableHead>
						{groupColumns.map((name) => (
							<TableHead key={name}>{name}</TableHead>
						))}
						<TableHead className="tw:text-right">Calls</TableHead>
						<TableHead className="tw:text-right">p99 latency</TableHead>
						<TableHead>Last used</TableHead>
						<TableHead className="tw:w-[20%]">Error %</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{loading &&
						SKELETON_ROWS.map((key) => (
							<TableRow key={key} data-testid="endpoint-row-loading">
								<TableCell colSpan={columnCount}>
									<Skeleton className="tw:h-5 tw:bg-muted" />
								</TableCell>
							</TableRow>
						))}
					{!loading && rows.length === 0 && (
						<TableRow className="tw:hover:bg-transparent">
							<TableCell
								colSpan={columnCount}
								data-testid="domain-endpoints-empty"
								className="tw:h-24 tw:text-center tw:text-[13px] tw:text-muted-foreground"
							>
								No endpoints in this range. Widen the time range or the filters.
							</TableCell>
						</TableRow>
					)}
					{!loading &&
						rows.map((row) => {
							const url = String(row[SPAN_ATTRIBUTES.HTTP_URL] ?? '');
							const { endpoint } = extractPortAndEndpoint(url);
							const key = [url, ...groupColumns.map((name) => row[name])].join('|');
							return (
								<TableRow
									key={key}
									data-testid="endpoint-row"
									className="tw:h-12 tw:cursor-pointer"
									onClick={(): void => onRowClick(row)}
								>
									<TableCell className="tw:max-w-0">
										<span
											className="tw:block tw:truncate tw:font-mono tw:font-medium"
											title={url}
										>
											{endpoint || '—'}
										</span>
									</TableCell>
									{groupColumns.map((name) => (
										<TableCell key={name} className="tw:font-mono tw:text-xs">
											{String(row[name] ?? '—')}
										</TableCell>
									))}
									<TableCell className={NUMBER}>
										{formatCount(toNumber(row.A))}
									</TableCell>
									<TableCell className={NUMBER}>
										{formatMs(
											toNumber(row.B) === undefined
												? undefined
												: (toNumber(row.B) as number) / 1e6,
										)}
									</TableCell>
									<TableCell className="tw:text-muted-foreground tw:tabular-nums">
										{lastUsed(row.C)}
									</TableCell>
									<TableCell>
										<ErrorRateBar value={toNumber(row.F1)} />
									</TableCell>
								</TableRow>
							);
						})}
				</TableBody>
			</Table>
		</ContentPanel>
	);
}

export default EndpointsTable;
