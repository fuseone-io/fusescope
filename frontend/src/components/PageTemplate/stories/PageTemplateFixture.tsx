import { useState } from 'react';
import { Button } from 'components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { DraftingCompass, ScrollText, Server } from 'lucide-react';

import ImpactBar from '../components/ImpactBar';
import KpiStrip from '../components/KpiStrip';
import PageHeader from '../components/PageHeader';
import PageTabs from '../components/PageTabs';
import Panel from '../components/Panel';
import SortableTableHead from '../components/SortableTableHead';
import Stat from '../components/Stat';
import StatusBadge from '../components/StatusBadge';
import TablePagination from '../components/TablePagination';
import PageTemplate from '../PageTemplate';
import { SortState, StatusTone } from '../types';
import { compareRows, nextSort, pageOf } from '../utils';

interface Row {
	name: string;
	calls: number;
	p99: number;
	errors: number;
	tone: StatusTone;
}

const ROWS: Row[] = [
	{
		name: 'POST /v1/payments',
		calls: 412,
		p99: 1420,
		errors: 8.7,
		tone: 'error',
	},
	{
		name: 'POST /v1/checkout',
		calls: 386,
		p99: 880,
		errors: 1.1,
		tone: 'warning',
	},
	{
		name: 'GET /v1/cart/{id}',
		calls: 1020,
		p99: 64,
		errors: 0.02,
		tone: 'success',
	},
	{
		name: 'GET /v1/shipping',
		calls: 298,
		p99: 210,
		errors: 0.08,
		tone: 'success',
	},
];

const TOTAL_CALLS = ROWS.reduce((sum, row) => sum + row.calls, 0);

function ChartPlaceholder(): JSX.Element {
	return (
		<div className="tw:m-5 tw:h-40 tw:rounded-md tw:border tw:border-dashed tw:border-border" />
	);
}

function OperationsPanel(): JSX.Element {
	const [sort, setSort] = useState<SortState<'calls' | 'p99'>>({
		key: 'p99',
		direction: 'desc',
	});
	const [page, setPage] = useState(1);
	const rows = pageOf(
		[...ROWS].sort(compareRows(sort.key, sort.direction)),
		page,
		2,
	);

	return (
		<Panel
			title="Key operations"
			subtitle="Sorted by p99 · share of calls"
			actions={<Button variant="link">All operations</Button>}
			className="tw:overflow-hidden"
			bodyClassName="tw:pt-3"
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Operation</TableHead>
						<SortableTableHead
							label="p99 (ms)"
							align="right"
							active={sort.key === 'p99'}
							direction={sort.direction}
							onSort={(): void => setSort((current) => nextSort(current, 'p99'))}
						/>
						<SortableTableHead
							label="Calls"
							active={sort.key === 'calls'}
							direction={sort.direction}
							onSort={(): void => setSort((current) => nextSort(current, 'calls'))}
						/>
						<TableHead className="tw:text-right">Errors</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<TableRow key={row.name}>
							<TableCell className="tw:font-mono tw:text-xs tw:text-primary">
								{row.name}
							</TableCell>
							<TableCell className="tw:text-right tw:tabular-nums">
								{row.p99}
							</TableCell>
							<TableCell>
								<span className="tw:flex tw:items-center tw:gap-2">
									<span className="tw:min-w-12 tw:text-right tw:tabular-nums">
										{row.calls}
									</span>
									<ImpactBar
										value={(row.calls / TOTAL_CALLS) * 100}
										label="share of calls"
									/>
								</span>
							</TableCell>
							<TableCell className="tw:text-right">
								<StatusBadge tone={row.tone}>{`${row.errors.toFixed(2)}%`}</StatusBadge>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			<TablePagination page={page} pageSize={2} total={4} onPageChange={setPage} />
		</Panel>
	);
}

function OverviewTab(): JSX.Element {
	return (
		<div className="tw:flex tw:flex-col tw:gap-4">
			<KpiStrip label="Service metrics">
				<Stat label="Requests" value="2.41" unit="ops/s" />
				<Stat label="Error rate" value="1.90" unit="%" />
				<Stat label="P99 latency" value="612.00" unit="ms" />
				<Stat label="Calls" value="14,460" note="in the selected range" />
			</KpiStrip>
			<div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] tw:gap-4">
				<Panel title="Latency" subtitle="ms · p50, p90, p99">
					<ChartPlaceholder />
				</Panel>
				<Panel title="Rate" subtitle="ops/s">
					<ChartPlaceholder />
				</Panel>
			</div>
			<OperationsPanel />
		</div>
	);
}

/** Every page-template part on one page, as a service detail would use them. */
function PageTemplateFixture(): JSX.Element {
	const [tab, setTab] = useState('overview');

	return (
		<PageTemplate>
			<PageHeader
				icon={<Server />}
				title="checkout-api"
				titleMono
				badges={<StatusBadge tone="info">Example</StatusBadge>}
				meta={[
					{ key: 'env', content: <span className="tw:font-mono">production</span> },
					{ key: 'ops', content: '24 operations' },
				]}
				actions={
					<>
						<Button variant="outline">
							<ScrollText aria-hidden="true" />
							View logs
						</Button>
						<Button variant="outline">
							<DraftingCompass aria-hidden="true" />
							View traces
						</Button>
					</>
				}
			/>
			<PageTabs
				label="Sections"
				value={tab}
				onValueChange={setTab}
				tabs={[
					{ value: 'overview', label: 'Overview', content: <OverviewTab /> },
					{
						value: 'db',
						label: 'DB Call Metrics',
						badge: <StatusBadge tone="neutral">2</StatusBadge>,
						content: (
							<Panel title="Database calls">
								<ChartPlaceholder />
							</Panel>
						),
					},
				]}
			/>
		</PageTemplate>
	);
}

export default PageTemplateFixture;
