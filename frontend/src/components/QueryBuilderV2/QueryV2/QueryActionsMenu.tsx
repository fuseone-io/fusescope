import { Button } from 'components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import { Copy, Ellipsis, Trash2 } from 'lucide-react';

interface QueryActionsMenuProps {
	queryName: string;
	onClone: () => void;
	/** Omitted when the query is the only one, which cannot be deleted. */
	onDelete?: () => void;
}

function QueryActionsMenu({
	queryName,
	onClone,
	onDelete,
}: QueryActionsMenuProps): JSX.Element {
	return (
		<span className="fs-ui query-actions-trigger tw:inline-flex">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={`Actions for query ${queryName}`}
						data-testid={`query-actions-${queryName}`}
						className="tw:text-muted-foreground"
					>
						<Ellipsis />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" sideOffset={4} className="tw:min-w-36">
					<DropdownMenuItem onSelect={onClone}>
						<Copy />
						Clone
					</DropdownMenuItem>
					{onDelete && (
						<DropdownMenuItem variant="destructive" onSelect={onDelete}>
							<Trash2 />
							Delete
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</span>
	);
}

QueryActionsMenu.defaultProps = {
	onDelete: undefined,
};

export default QueryActionsMenu;
