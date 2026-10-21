import { Skeleton } from 'components/ui/skeleton';

const STAT_PLACEHOLDERS = ['total-triggered', 'avg-resolution-time'];

function StatsLoading(): JSX.Element {
	return (
		<>
			{STAT_PLACEHOLDERS.map((key) => (
				<div
					key={key}
					data-testid="stats-card-loading"
					className="tw:flex tw:min-h-[188px] tw:flex-col tw:gap-3 tw:bg-surface-raised tw:px-5 tw:py-4"
				>
					<Skeleton className="tw:h-3 tw:w-28 tw:bg-muted" />
					<Skeleton className="tw:h-7 tw:w-16 tw:bg-muted" />
					<Skeleton className="tw:h-5 tw:w-32 tw:bg-muted" />
				</div>
			))}
		</>
	);
}

export default StatsLoading;
