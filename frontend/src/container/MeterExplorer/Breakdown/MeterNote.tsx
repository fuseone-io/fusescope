import { ReactNode } from 'react';
import { Button } from 'components/ui/button';
import { cn } from 'lib/utils';
import { Info, TriangleAlert, X } from 'lucide-react';

interface MeterNoteProps {
	tone: 'info' | 'warning';
	children: ReactNode;
	onDismiss?: () => void;
	testId?: string;
}

/** A one-line note above the meter charts. */
function MeterNote({
	tone,
	children,
	onDismiss,
	testId,
}: MeterNoteProps): JSX.Element {
	const Icon = tone === 'info' ? Info : TriangleAlert;
	return (
		<div
			role="note"
			data-testid={testId}
			className={cn(
				'fs-ui tw:flex tw:items-start tw:gap-3 tw:rounded-xl tw:border tw:py-2.5 tw:pr-2.5 tw:pl-4 tw:font-sans tw:text-[13px] tw:text-foreground',
				tone === 'info'
					? 'tw:border-border tw:bg-primary-soft'
					: 'tw:border-border tw:bg-warning-soft',
			)}
		>
			<Icon
				aria-hidden="true"
				className={cn(
					'tw:mt-0.5 tw:size-4 tw:flex-none',
					tone === 'info' ? 'tw:text-primary-ink' : 'tw:text-warning-ink',
				)}
			/>
			<span className="tw:flex-1">{children}</span>
			{onDismiss && (
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					aria-label="Dismiss"
					onClick={onDismiss}
				>
					<X />
				</Button>
			)}
		</div>
	);
}

export default MeterNote;
