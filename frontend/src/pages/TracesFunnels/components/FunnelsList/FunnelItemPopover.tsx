import { MouseEvent, useRef, useState } from 'react';
import { Button } from 'components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import { Ellipsis, PencilLine, Trash2 } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { FunnelData } from 'types/api/traceFunnels';

import { FLOATING_LAYER_CLASS } from '../../constants';
import DeleteFunnel from '../DeleteFunnel/DeleteFunnel';
import HintTooltip from '../HintTooltip/HintTooltip';
import RenameFunnel from '../RenameFunnel/RenameFunnel';

interface FunnelItemPopoverProps {
	isPopoverOpen: boolean;
	setIsPopoverOpen: (isOpen: boolean) => void;
	funnel: FunnelData;
	shouldRedirectToTracesListOnDeleteSuccess?: boolean;
}

// The menu sits inside a clickable row or link. React bubbles clicks from the
// portalled dialogs through it too; those must keep their default action.
const stopRowClick = (e: MouseEvent<HTMLElement>): void => {
	e.stopPropagation();
	if (e.currentTarget.contains(e.target as Node)) {
		e.preventDefault();
	}
};

function FunnelItemPopover({
	isPopoverOpen,
	setIsPopoverOpen,
	funnel,
	shouldRedirectToTracesListOnDeleteSuccess = true,
}: FunnelItemPopoverProps): JSX.Element {
	const [isRenameModalOpen, setIsRenameModalOpen] = useState<boolean>(false);
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
	const { hasEditPermission } = useAppContext();
	// Dialogs open once the menu has closed, so the menu does not take their focus.
	const pendingDialog = useRef<(() => void) | null>(null);

	if (!hasEditPermission) {
		return (
			<HintTooltip title="You need editor or admin access to edit funnels">
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label="Funnel actions"
					disabled
				>
					<Ellipsis />
				</Button>
			</HintTooltip>
		);
	}

	return (
		// eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
		<span onClick={stopRowClick} className="fs-ui tw:inline-flex">
			<DropdownMenu
				modal={false}
				open={isPopoverOpen}
				onOpenChange={setIsPopoverOpen}
			>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Funnel actions"
						data-testid="funnel-actions"
						className="tw:text-muted-foreground tw:hover:text-foreground"
					>
						<Ellipsis />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					onCloseAutoFocus={(event): void => {
						if (pendingDialog.current) {
							event.preventDefault();
							pendingDialog.current();
							pendingDialog.current = null;
						}
					}}
					align="end"
					aria-label="Funnel actions"
					className={`tw:min-w-[140px] ${FLOATING_LAYER_CLASS}`}
				>
					<DropdownMenuItem
						className="tw:text-[13px]"
						onSelect={(): void => {
							pendingDialog.current = (): void => setIsRenameModalOpen(true);
						}}
					>
						<PencilLine className="tw:size-3.5" />
						Rename
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						className="tw:text-[13px]"
						onSelect={(): void => {
							pendingDialog.current = (): void => setIsDeleteModalOpen(true);
						}}
					>
						<Trash2 className="tw:size-3.5" />
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<DeleteFunnel
				shouldRedirectToTracesListOnDeleteSuccess={
					shouldRedirectToTracesListOnDeleteSuccess
				}
				isOpen={isDeleteModalOpen}
				onClose={(): void => setIsDeleteModalOpen(false)}
				funnelId={funnel.funnel_id}
			/>

			<RenameFunnel
				isOpen={isRenameModalOpen}
				onClose={(): void => setIsRenameModalOpen(false)}
				funnelId={funnel.funnel_id}
				initialName={funnel.funnel_name}
			/>
		</span>
	);
}

export default FunnelItemPopover;
