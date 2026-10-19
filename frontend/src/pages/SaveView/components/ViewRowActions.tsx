import { Button } from 'components/ui/button';
import { cn } from 'lib/utils';
import { Compass, PenLine, Trash2 } from 'lucide-react';

interface ViewRowActionsProps {
	canEdit: boolean;
	onEdit: () => void;
	onOpen: () => void;
	onDelete: () => void;
}

const ACTION = 'tw:text-muted-foreground tw:hover:text-foreground';

function ViewRowActions({
	canEdit,
	onEdit,
	onOpen,
	onDelete,
}: ViewRowActionsProps): JSX.Element {
	return (
		<span className="tw:inline-flex tw:justify-end tw:gap-0.5">
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label="Edit view"
				data-testid="edit-view"
				className={cn(ACTION, !canEdit && 'tw:hidden')}
				onClick={onEdit}
			>
				<PenLine className="tw:size-3.5" />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label="Open in explorer"
				data-testid="go-to-explorer"
				className={ACTION}
				onClick={onOpen}
			>
				<Compass className="tw:size-3.5" />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label="Delete view"
				data-testid="delete-view"
				className={cn('tw:text-error tw:hover:text-error', !canEdit && 'tw:hidden')}
				onClick={onDelete}
			>
				<Trash2 className="tw:size-3.5" />
			</Button>
		</span>
	);
}

export default ViewRowActions;
