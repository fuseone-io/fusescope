import { ReactNode } from 'react';
import { cn } from 'lib/utils';

interface TagChipProps {
	children: ReactNode;
	className?: string;
	testId?: string;
	title?: string;
}

/** A `key:value` tag: monospace, outlined and neutral, as tags read in tables and headers. */
function TagChip({
	children,
	className,
	testId,
	title,
}: TagChipProps): JSX.Element {
	return (
		<span
			data-testid={testId}
			title={title}
			className={cn(
				'tw:inline-flex tw:h-5 tw:max-w-60 tw:flex-none tw:items-center tw:rounded-sm tw:border tw:border-border tw:px-1.5 tw:font-mono tw:text-[11px] tw:leading-none tw:whitespace-nowrap tw:text-muted-foreground',
				className,
			)}
		>
			<span className="tw:min-w-0 tw:truncate">{children}</span>
		</span>
	);
}

export default TagChip;
