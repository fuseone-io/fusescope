import { Button } from 'components/ui/button';
import { RotateCw, TriangleAlert } from 'lucide-react';
import { cn } from 'lib/utils';

interface ErrorStateProps {
	refetch: () => void;
	/** One line, for headers and toolbars. */
	compact?: boolean;
}

function ErrorState({
	refetch,
	compact = false,
}: ErrorStateProps): JSX.Element {
	return (
		<div
			role="alert"
			className={cn(
				'fs-ui tw:flex tw:items-center tw:gap-3 tw:font-sans tw:text-[13px]',
				compact
					? 'tw:inline-flex'
					: 'tw:flex-wrap tw:justify-between tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised tw:px-4 tw:py-3',
			)}
		>
			<span className="tw:flex tw:items-center tw:gap-2">
				<TriangleAlert
					aria-hidden="true"
					className="tw:size-4 tw:flex-none tw:text-error"
				/>
				<span>Uh-oh :/ We ran into an error.</span>
				<span className="tw:text-muted-foreground">Please refresh this panel.</span>
			</span>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={(): void => refetch()}
			>
				<RotateCw aria-hidden="true" />
				Refresh this panel
			</Button>
		</div>
	);
}

export default ErrorState;
