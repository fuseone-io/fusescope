import { Button } from 'components/ui/button';
import { ArrowUpRight, RotateCw } from 'lucide-react';

interface IntegrationsErrorProps {
	testId: string;
	onRetry: () => void;
	onContactSupport: () => void;
}

function IntegrationsError({
	testId,
	onRetry,
	onContactSupport,
}: IntegrationsErrorProps): JSX.Element {
	return (
		<div
			data-testid={testId}
			className="fs-ui tw:flex tw:flex-col tw:items-center tw:font-sans tw:text-foreground tw:gap-3 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:px-5 tw:py-8 tw:text-center"
		>
			<p className="tw:text-sm tw:text-muted-foreground">
				Something went wrong :/ Please retry or contact support.
			</p>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:justify-center tw:gap-2">
				<Button size="sm" onClick={onRetry}>
					<RotateCw aria-hidden="true" />
					Retry
				</Button>
				<Button
					size="sm"
					variant="ghost"
					className="tw:text-primary! tw:hover:bg-muted!"
					onClick={onContactSupport}
				>
					Contact Support
					<ArrowUpRight aria-hidden="true" />
				</Button>
			</div>
		</div>
	);
}

export default IntegrationsError;
