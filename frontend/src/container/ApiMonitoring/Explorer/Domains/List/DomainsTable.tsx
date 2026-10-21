import { useLocation } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import SortableTableHead from 'components/PageTemplate/components/SortableTableHead';
import { SortState } from 'components/PageTemplate/types';
import { Skeleton } from 'components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { isModifierKeyPressed } from 'utils/app';

import ErrorRateBar from '../../../components/ErrorRateBar';
import { DomainRow, DomainSortKey, formatMs } from '../../../domainList';
import { domainPath, domainSearch } from '../../../domainRoute';
import { getLastUsedRelativeTime } from '../../../utils';
import DomainNameCell from './DomainNameCell';

interface DomainsTableProps {
	rows: DomainRow[];
	loading: boolean;
	callers: Map<string, string[]>;
	sort: SortState<DomainSortKey>;
	onSort: (key: DomainSortKey) => void;
}

const SKELETON_ROWS = ['a', 'b', 'c', 'd'];
const COLUMNS: {
	key: DomainSortKey;
	label: string;
	align: 'left' | 'right';
}[] = [
	{ key: 'endpoints', label: 'Endpoints', align: 'right' },
	{ key: 'lastUsedMs', label: 'Last used', align: 'left' },
	{ key: 'rate', label: 'Rate', align: 'right' },
	{ key: 'errorRate', label: 'Error %', align: 'left' },
	{ key: 'p99Ms', label: 'p99 latency', align: 'right' },
];
const NUMBER = 'tw:text-right tw:tabular-nums';

const logDomainClick = (): void => {
	logEvent('API Monitoring: Domain name row clicked', {});
};

function formatRate(rate: number | undefined): string {
	if (rate === undefined) {
		return '—';
	}
	return rate.toFixed(rate < 10 ? 2 : 1);
}

function DomainsTable({
	rows,
	loading,
	callers,
	sort,
	onSort,
}: DomainsTableProps): JSX.Element {
	const { search } = useLocation();
	const { safeNavigate } = useSafeNavigate();

	return (
		<Table className="tw:min-w-[960px]" aria-label="Domains">
			<TableHeader className="tw:bg-surface-sunken">
				<TableRow>
					<TableHead className="tw:w-[34%]">Domain</TableHead>
					{COLUMNS.map((column) => (
						<SortableTableHead
							key={column.key}
							label={column.label}
							align={column.align}
							active={sort.key === column.key}
							direction={sort.direction}
							onSort={(): void => onSort(column.key)}
							testId={`api-monitoring-sort-${column.key}`}
							className={column.key === 'errorRate' ? 'tw:w-[18%]' : undefined}
						/>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{loading &&
					SKELETON_ROWS.map((key) => (
						<TableRow key={key} data-testid="domain-row-loading">
							<TableCell colSpan={COLUMNS.length + 1}>
								<Skeleton className="tw:h-5 tw:bg-muted" />
							</TableCell>
						</TableRow>
					))}
				{!loading &&
					rows.map((row) => {
						const href = domainPath(row.domain, domainSearch(search));
						return (
							<TableRow
								key={row.domain}
								data-testid="domain-row"
								className="tw:h-[52px] tw:cursor-pointer"
								onClick={(event): void => {
									logDomainClick();
									safeNavigate(href, { newTab: isModifierKeyPressed(event) });
								}}
							>
								<TableCell className="tw:max-w-0">
									<DomainNameCell
										domain={row.domain}
										href={href}
										isIp={row.isIp}
										onOpen={logDomainClick}
										callers={callers.get(row.domain)}
									/>
								</TableCell>
								<TableCell className={NUMBER}>{row.endpoints ?? '—'}</TableCell>
								<TableCell className="tw:text-muted-foreground tw:tabular-nums">
									{row.lastUsedMs === undefined
										? '—'
										: getLastUsedRelativeTime(row.lastUsedMs)}
								</TableCell>
								<TableCell className={NUMBER}>
									{formatRate(row.rate)}
									{row.rate !== undefined && (
										<span className="tw:ml-1 tw:text-subtle-foreground">ops/s</span>
									)}
								</TableCell>
								<TableCell>
									<ErrorRateBar value={row.errorRate} />
								</TableCell>
								<TableCell className={NUMBER}>{formatMs(row.p99Ms)}</TableCell>
							</TableRow>
						);
					})}
			</TableBody>
		</Table>
	);
}

export default DomainsTable;
