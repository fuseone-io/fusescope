import TanStackTable from 'components/TanStackTableView';
import { cn } from 'lib/utils';
import { getMs } from 'utils/timeUtils';

interface DurationCellProps {
	name: string;
	durationNano: number;
	/** Longest duration on the page; the bar is drawn relative to it. */
	maxDurationNano?: number;
	isError: boolean;
}

function DurationCell({
	name,
	durationNano,
	maxDurationNano,
	isError,
}: DurationCellProps): JSX.Element {
	const share =
		maxDurationNano && maxDurationNano > 0
			? Math.max(2, Math.min(100, (durationNano / maxDurationNano) * 100))
			: 0;

	return (
		<span className="fs-ui tw:flex tw:min-w-0 tw:items-center tw:gap-2">
			{share > 0 && (
				<span
					aria-hidden="true"
					className="tw:h-1.5 tw:min-w-8 tw:flex-1 tw:overflow-hidden tw:rounded-full tw:bg-muted"
				>
					<span
						data-testid="duration-bar"
						data-error={isError}
						className={cn(
							'tw:block tw:h-full tw:rounded-full',
							isError ? 'tw:bg-error' : 'tw:bg-primary',
						)}
						style={{ width: `${Math.round(share)}%` }}
					/>
				</span>
			)}
			<TanStackTable.Text
				data-testid={name}
				className="tw:min-w-16 tw:flex-none tw:text-right tw:tabular-nums"
			>
				{getMs(String(durationNano))}ms
			</TanStackTable.Text>
		</span>
	);
}

DurationCell.defaultProps = {
	maxDurationNano: undefined,
};

export default DurationCell;
