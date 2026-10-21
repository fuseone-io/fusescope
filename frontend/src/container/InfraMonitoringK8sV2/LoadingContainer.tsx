import { Skeleton } from 'components/ui/skeleton';

function LoadingContainer(): JSX.Element {
	return (
		<div
			className="fs-ui tw:flex tw:flex-col tw:gap-2 tw:py-2"
			data-testid="loader"
		>
			<Skeleton className="tw:h-12 tw:w-full tw:bg-muted" />
			<Skeleton className="tw:h-12 tw:w-full tw:bg-muted" />
			<Skeleton className="tw:h-12 tw:w-full tw:bg-muted" />
		</div>
	);
}

export default LoadingContainer;
