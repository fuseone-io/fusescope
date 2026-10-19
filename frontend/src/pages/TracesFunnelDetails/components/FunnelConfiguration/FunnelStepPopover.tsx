import { MouseEvent, useRef, useState } from 'react';
import { Button } from 'components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import { Ellipsis, PencilLine, Trash2 } from 'lucide-react';
import { FLOATING_LAYER_CLASS } from 'pages/TracesFunnels/constants';
import HintTooltip from 'pages/TracesFunnels/components/HintTooltip/HintTooltip';
import { useAppContext } from 'providers/App/App';
import { FunnelStepData } from 'types/api/traceFunnels';

import AddFunnelStepDetailsModal from './AddFunnelStepDetailsModal';
import DeleteFunnelStep from './DeleteFunnelStep';

export interface FunnelStepPopoverProps {
	isPopoverOpen: boolean;
	setIsPopoverOpen: (isOpen: boolean) => void;
	stepData: {
		step_order: FunnelStepData['step_order'];
		name?: FunnelStepData['name'];
		description?: FunnelStepData['description'];
	};
	stepsCount: number;
	onStepRemove: () => void;
	isAddDetailsModalOpen: boolean;
	setIsAddDetailsModalOpen: (isOpen: boolean) => void;
}

const ICON_BUTTON = 'tw:text-muted-foreground tw:hover:text-foreground';

function FunnelStepPopover({
	isPopoverOpen,
	setIsPopoverOpen,
	stepData,
	onStepRemove,
	stepsCount,
	isAddDetailsModalOpen,
	setIsAddDetailsModalOpen,
}: FunnelStepPopoverProps): JSX.Element {
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
	const { hasEditPermission } = useAppContext();
	// Dialogs open once the menu has closed, so the menu does not take their focus.
	const pendingDialog = useRef<(() => void) | null>(null);
	const canDelete = stepsCount > 2;

	if (!hasEditPermission) {
		return (
			<HintTooltip title="You need editor or admin access to add details to step">
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label="Step actions"
					className={ICON_BUTTON}
					disabled
				>
					<Ellipsis className="tw:size-3.5" />
				</Button>
			</HintTooltip>
		);
	}

	return (
		// eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
		<span
			className="tw:inline-flex"
			onClick={(e: MouseEvent): void => e.stopPropagation()}
		>
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
						aria-label="Step actions"
						className={ICON_BUTTON}
					>
						<Ellipsis className="tw:size-3.5" />
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
					aria-label="Step actions"
					className={`tw:min-w-[150px] ${FLOATING_LAYER_CLASS}`}
				>
					<DropdownMenuItem
						className="tw:text-[13px]"
						onSelect={(): void => {
							pendingDialog.current = (): void => setIsAddDetailsModalOpen(true);
						}}
					>
						<PencilLine className="tw:size-3.5" />
						Add details
					</DropdownMenuItem>
					<HintTooltip
						title={canDelete ? 'Delete' : 'Minimum 2 steps required'}
						className="tw:flex tw:flex-col"
						side="right"
					>
						<DropdownMenuItem
							variant="destructive"
							aria-disabled={!canDelete}
							className="tw:text-[13px] tw:aria-disabled:cursor-not-allowed tw:aria-disabled:opacity-50"
							onSelect={(event): void => {
								if (!canDelete) {
									event.preventDefault();
									return;
								}
								pendingDialog.current = (): void => setIsDeleteModalOpen(true);
							}}
						>
							<Trash2 className="tw:size-3.5" />
							Delete
						</DropdownMenuItem>
					</HintTooltip>
				</DropdownMenuContent>
			</DropdownMenu>

			<DeleteFunnelStep
				isOpen={isDeleteModalOpen}
				onClose={(): void => setIsDeleteModalOpen(false)}
				onStepRemove={onStepRemove}
			/>

			<AddFunnelStepDetailsModal
				isOpen={isAddDetailsModalOpen}
				onClose={(): void => setIsAddDetailsModalOpen(false)}
				stepData={stepData}
			/>
		</span>
	);
}

export default FunnelStepPopover;
