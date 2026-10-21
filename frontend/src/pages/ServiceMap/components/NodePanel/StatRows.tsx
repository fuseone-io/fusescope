import { formatLatencyMs, formatPercent, formatRate } from 'lib/apm/format';
import { cn } from 'lib/utils';

import { RING_CLASS } from '../../constants';
import { StatRow } from '../../types';

interface StatRowsProps {
	rows: StatRow[];
	empty: string;
	/** Rows are buttons that select the node they name. */
	onSelect?: (name: string) => void;
	testId?: string;
}

const GRID =
	'tw:grid tw:w-full tw:grid-cols-[minmax(0,1fr)_76px_48px_58px] tw:items-center tw:gap-2 tw:text-xs';

function cells(row: StatRow): JSX.Element {
	return (
		<>
			<span className="tw:flex tw:min-w-0 tw:items-center tw:gap-1.5">
				{row.tone && (
					<span
						aria-hidden="true"
						className={cn(
							'tw:size-2 tw:flex-none tw:rounded-full tw:border-2',
							RING_CLASS[row.tone],
						)}
					/>
				)}
				<span title={row.name} className="tw:truncate tw:font-mono">
					{row.name}
				</span>
			</span>
			<span className="tw:text-right tw:tabular-nums">{formatRate(row.rate)}</span>
			<span
				className={cn(
					'tw:text-right tw:tabular-nums',
					row.errorRate >= 1 && 'tw:text-error',
				)}
			>
				{formatPercent(row.errorRate)}
			</span>
			<span className="tw:text-right tw:tabular-nums">
				{formatLatencyMs(row.p99)}
			</span>
		</>
	);
}

/** Name, req/s, error rate and p99 per row. */
function StatRows({
	rows,
	empty,
	onSelect,
	testId,
}: StatRowsProps): JSX.Element {
	if (rows.length === 0) {
		return <span className="tw:text-xs tw:text-subtle-foreground">{empty}</span>;
	}
	return (
		<ul data-testid={testId} className="tw:-mx-1.5 tw:flex tw:flex-col">
			{rows.map((row) => (
				<li key={row.name}>
					{onSelect ? (
						<button
							type="button"
							aria-label={`Select ${row.name}`}
							onClick={(): void => onSelect(row.name)}
							className={cn(
								GRID,
								'tw:min-h-[30px] tw:cursor-pointer tw:rounded-md tw:px-1.5 tw:text-left tw:text-foreground tw:hover:bg-muted',
							)}
						>
							{cells(row)}
						</button>
					) : (
						<div className={cn(GRID, 'tw:min-h-7 tw:px-1.5 tw:text-foreground')}>
							{cells(row)}
						</div>
					)}
				</li>
			))}
		</ul>
	);
}

export default StatRows;
