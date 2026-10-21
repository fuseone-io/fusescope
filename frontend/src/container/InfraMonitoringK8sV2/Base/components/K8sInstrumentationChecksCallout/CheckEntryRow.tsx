import { cn } from 'lib/utils';
import { CircleCheck, TriangleAlert } from 'lucide-react';

interface CheckEntryRowProps {
	passed: boolean;
	typeLabel: string;
	items: string[] | null | undefined;
	componentName: string;
	documentationLink?: string;
}

export function CheckEntryRow({
	passed,
	typeLabel,
	items,
	componentName,
	documentationLink,
}: CheckEntryRowProps): JSX.Element {
	const Icon = passed ? CircleCheck : TriangleAlert;

	return (
		<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-x-2 tw:gap-y-1.5 tw:border-t tw:border-border tw:py-2 tw:text-[13px]">
			<Icon
				size={16}
				role="img"
				aria-label={passed ? 'Passed' : 'Needs attention'}
				className={cn(
					'tw:flex-none',
					passed ? 'tw:text-success' : 'tw:text-warning',
				)}
			/>
			<strong className="tw:font-semibold">{typeLabel}</strong>
			<span className="tw:font-mono tw:text-xs tw:text-foreground">
				{items?.join(', ')}
			</span>
			<span className="tw:text-xs tw:text-muted-foreground tw:italic">
				{componentName}
			</span>
			{documentationLink && (
				<a
					href={documentationLink}
					target="_blank"
					rel="noopener noreferrer"
					className="tw:text-xs tw:text-primary-ink! tw:underline tw:underline-offset-2 tw:hover:no-underline"
				>
					Learn how to fix
				</a>
			)}
		</div>
	);
}
