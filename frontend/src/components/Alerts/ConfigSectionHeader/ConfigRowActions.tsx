import { MouseEvent } from 'react';
import { Button } from 'components/ui/button';
import { cn } from 'lib/utils';
import { ChevronDown, PenLine, Trash2 } from 'lucide-react';

interface ConfigRowActionsProps {
	itemName: string;
	expanded: boolean;
	onToggle: () => void;
	/** Edit and delete render only when both are given. */
	onEdit?: () => void;
	onDelete?: () => void;
	editTestId?: string;
	deleteTestId?: string;
}

function stop(handler: () => void): (event: MouseEvent) => void {
	return (event): void => {
		event.preventDefault();
		event.stopPropagation();
		handler();
	};
}

/** Edit, delete and the details toggle at the end of a configuration row. */
function ConfigRowActions({
	itemName,
	expanded,
	onToggle,
	onEdit,
	onDelete,
	editTestId,
	deleteTestId,
}: ConfigRowActionsProps): JSX.Element {
	return (
		<div className="tw:flex tw:items-center tw:justify-end tw:gap-0.5">
			{onEdit && onDelete && (
				<>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={`Edit ${itemName}`}
						data-testid={editTestId}
						onClick={stop(onEdit)}
					>
						<PenLine aria-hidden="true" />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={`Delete ${itemName}`}
						data-testid={deleteTestId}
						onClick={stop(onDelete)}
						className="tw:text-error-ink tw:hover:text-error-ink"
					>
						<Trash2 aria-hidden="true" />
					</Button>
				</>
			)}
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label={expanded ? 'Hide details' : 'Show details'}
				aria-expanded={expanded}
				onClick={stop(onToggle)}
			>
				<ChevronDown
					aria-hidden="true"
					className={cn('tw:transition-transform', expanded && 'tw:rotate-180')}
				/>
			</Button>
		</div>
	);
}

export default ConfigRowActions;
