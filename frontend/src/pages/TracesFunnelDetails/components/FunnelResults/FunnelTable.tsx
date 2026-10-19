import { Link } from 'react-router-dom';
import { getYAxisFormattedValue } from 'components/Graph/yAxisConfig';
import { Skeleton } from 'components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { Info } from 'lucide-react';
import HintTooltip from 'pages/TracesFunnels/components/HintTooltip/HintTooltip';

import { TopTraceRow } from './types';

interface FunnelTableProps {
	title: string;
	tooltip: string;
	data: TopTraceRow[];
	loading: boolean;
	markErrors?: boolean;
}

const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e'];

function FunnelTable({
	title,
	tooltip,
	data,
	loading,
	markErrors = false,
}: FunnelTableProps): JSX.Element {
	return (
		<section
			aria-label={title}
			className="fs-ui tw:flex tw:min-w-0 tw:flex-col tw:overflow-hidden tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised tw:font-sans tw:text-foreground"
		>
			<div className="tw:flex tw:items-center tw:gap-1.5 tw:px-5 tw:py-3.5">
				<h3 className="tw:m-0 tw:text-sm tw:font-semibold">{title}</h3>
				<HintTooltip title={tooltip}>
					<span className="tw:inline-flex tw:text-subtle-foreground">
						<Info aria-hidden="true" className="tw:size-3.5" />
						<span className="tw:sr-only">{tooltip}</span>
					</span>
				</HintTooltip>
			</div>
			<Table className="tw:table-fixed">
				<TableHeader className="tw:bg-surface-sunken">
					<TableRow>
						<TableHead>Trace ID</TableHead>
						<TableHead className="tw:w-[220px] tw:text-right">
							Step transition duration
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{loading &&
						SKELETON_ROWS.map((row) => (
							<TableRow key={row}>
								<TableCell colSpan={2} className="tw:h-10">
									<Skeleton className="tw:h-4 tw:bg-muted" />
								</TableCell>
							</TableRow>
						))}
					{!loading && data.length === 0 && (
						<TableRow className="tw:hover:bg-transparent">
							<TableCell
								colSpan={2}
								className="tw:h-24 tw:text-center tw:text-[13px] tw:text-muted-foreground"
							>
								No data
							</TableCell>
						</TableRow>
					)}
					{!loading &&
						data.map((row) => (
							<TableRow key={row.trace_id}>
								<TableCell className="tw:h-10 tw:max-w-0">
									<span className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
										{markErrors && (
											<span
												aria-hidden="true"
												className="tw:size-1.5 tw:flex-none tw:rounded-full tw:bg-error"
											/>
										)}
										<Link
											to={`/trace/${row.trace_id}`}
											target="_blank"
											rel="noopener noreferrer"
											className="tw:truncate tw:font-mono tw:text-xs tw:text-primary! tw:hover:text-primary-strong! tw:hover:underline"
										>
											{row.trace_id}
										</Link>
									</span>
								</TableCell>
								<TableCell className="tw:h-10 tw:text-right tw:text-xs tw:tabular-nums">
									{getYAxisFormattedValue(`${row.duration_ms}`, 'ms')}
								</TableCell>
							</TableRow>
						))}
				</TableBody>
			</Table>
		</section>
	);
}

export default FunnelTable;
