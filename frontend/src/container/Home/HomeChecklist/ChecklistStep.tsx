import { Button } from 'components/ui/button';
import { cn } from 'lib/utils';
import { ArrowRightToLine, BookOpenText, Check } from 'lucide-react';

import type { ChecklistItem } from './HomeChecklist';

interface ChecklistStepProps {
	item: ChecklistItem;
	/** The first open step: its description and actions stay visible. */
	active: boolean;
	canAct: boolean;
	isLoading: boolean;
	onGetStarted: (item: ChecklistItem) => void;
	onDocs: (item: ChecklistItem) => void;
	onSkip: (item: ChecklistItem) => void;
}

function ChecklistStep({
	item,
	active,
	canAct,
	isLoading,
	onGetStarted,
	onDocs,
	onSkip,
}: ChecklistStepProps): JSX.Element {
	if (item.completed) {
		return (
			<li className="tw:flex tw:min-h-8 tw:items-center tw:gap-2.5 tw:px-2 tw:text-[13px] tw:text-muted-foreground">
				<span
					aria-hidden="true"
					className="tw:flex tw:size-[18px] tw:flex-none tw:items-center tw:justify-center tw:rounded-full tw:bg-success-soft tw:text-success-ink"
				>
					<Check aria-hidden="true" className="tw:size-3" strokeWidth={2.5} />
				</span>
				<span className="tw:sr-only">Done:</span>
				{item.title}
			</li>
		);
	}

	const revealed = active
		? 'tw:flex'
		: 'tw:hidden tw:group-hover:flex tw:group-focus-within:flex';

	return (
		<li
			data-state={active ? 'active' : undefined}
			className={cn(
				'tw:group tw:flex tw:flex-col tw:gap-1 tw:rounded-md tw:px-2 tw:py-1 tw:text-[13px] tw:hover:bg-muted',
				item.isSkipped && 'tw:opacity-60',
				isLoading && 'tw:pointer-events-none tw:opacity-60',
			)}
		>
			<div className="tw:flex tw:min-h-7 tw:items-center tw:gap-2.5">
				<span
					aria-hidden="true"
					className={cn(
						'tw:size-[18px] tw:flex-none tw:rounded-full tw:border-[1.5px] tw:border-dashed tw:border-subtle-foreground',
						active && 'tw:border-solid tw:border-primary',
					)}
				/>
				<span className="tw:min-w-0 tw:flex-1 tw:font-medium tw:text-foreground">
					{item.title}
				</span>
				{canAct && (
					<Button
						variant="outline"
						size="xs"
						onClick={(): void => onGetStarted(item)}
						className="tw:h-7"
					>
						Get started
					</Button>
				)}
			</div>

			{item.description && (
				<p className={cn('tw:pl-7 tw:text-xs tw:text-muted-foreground', revealed)}>
					{item.description}
				</p>
			)}

			{canAct && (item.docsLink || (item.isSkippable && !item.isSkipped)) && (
				<div className={cn('tw:items-center tw:gap-1 tw:pl-6', revealed)}>
					{item.docsLink && (
						<Button
							variant="ghost"
							size="xs"
							onClick={(): void => onDocs(item)}
							className="tw:text-muted-foreground"
						>
							<BookOpenText aria-hidden="true" />
							Docs
						</Button>
					)}
					{!item.isSkipped && item.isSkippable && (
						<Button
							variant="ghost"
							size="xs"
							disabled={isLoading}
							onClick={(): void => onSkip(item)}
							className="tw:text-muted-foreground"
						>
							<ArrowRightToLine aria-hidden="true" />
							Skip for now
						</Button>
					)}
				</div>
			)}
		</li>
	);
}

export default ChecklistStep;
