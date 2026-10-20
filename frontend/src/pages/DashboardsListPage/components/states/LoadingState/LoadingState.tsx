import { Skeleton } from 'components/ui/skeleton';

const ROWS = ['a', 'b', 'c', 'd', 'e'];

function LoadingState(): JSX.Element {
	return (
		<div
			aria-busy="true"
			aria-label="Loading dashboards"
			className="fs-ui tw:flex tw:flex-col tw:overflow-hidden tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised"
		>
			<div className="tw:h-9 tw:border-b tw:border-border tw:bg-surface-sunken" />
			{ROWS.map((row) => (
				<div
					key={row}
					className="tw:flex tw:h-[52px] tw:items-center tw:gap-3 tw:border-b tw:border-border tw:px-4 tw:last:border-b-0"
				>
					<Skeleton className="tw:size-5 tw:bg-muted" />
					<div className="tw:flex tw:flex-1 tw:flex-col tw:gap-1.5">
						<Skeleton className="tw:h-3 tw:w-2/5 tw:bg-muted" />
						<Skeleton className="tw:h-2.5 tw:w-3/5 tw:bg-muted" />
					</div>
					<Skeleton className="tw:h-5 tw:w-24 tw:bg-muted" />
					<Skeleton className="tw:h-3 tw:w-36 tw:bg-muted" />
				</div>
			))}
		</div>
	);
}

export default LoadingState;
