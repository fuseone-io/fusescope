import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import { Button } from 'components/ui/button';
import { Check, PenLine, Trash2, X } from 'lucide-react';

import type { VariableFormModel } from '../../variableFormModel';
import {
	BUTTON_GHOST,
	ICON_BUTTON,
} from '../../../components/settingsClassNames';

interface VariableRowActionsProps {
	variable: VariableFormModel;
	index: number;
	/** True when this row's delete is awaiting inline confirmation. */
	isConfirmingDelete: boolean;
	onEdit: (index: number) => void;
	onRequestDelete: (index: number) => void;
	onConfirmDelete: (index: number) => void;
	onCancelDelete: () => void;
	/** Apply this variable's filter to all panels. Dynamic variables only. */
	onApplyToAll: (index: number) => void;
	/** True when this dynamic variable is already applied to every panel. */
	isAppliedToAll: boolean;
}

/** A variable row's edit, delete (confirmed inline) and Apply to all. */
function VariableRowActions({
	variable,
	index,
	isConfirmingDelete,
	onEdit,
	onRequestDelete,
	onConfirmDelete,
	onCancelDelete,
	onApplyToAll,
	isAppliedToAll,
}: VariableRowActionsProps): JSX.Element {
	return (
		<div className="tw:flex tw:items-center tw:gap-0.5">
			{isConfirmingDelete ? (
				<>
					<span className="tw:mr-1 tw:text-[13px] tw:text-muted-foreground">
						Delete?
					</span>
					<Button
						type="button"
						variant="destructive"
						size="icon-sm"
						className="tw:size-8 tw:rounded-lg"
						onClick={(): void => onConfirmDelete(index)}
						aria-label="Confirm delete"
						data-testid={`variable-delete-confirm-${variable.name}`}
					>
						<Check aria-hidden="true" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						className={ICON_BUTTON}
						onClick={onCancelDelete}
						aria-label="Cancel delete"
					>
						<X aria-hidden="true" />
					</Button>
				</>
			) : (
				<>
					{variable.type === 'DYNAMIC' ? (
						<TitleTooltip
							side="top"
							title={
								isAppliedToAll
									? 'Already applied to all panels'
									: 'Add this variable as a filter to every panel'
							}
						>
							<span className="tw:inline-flex">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className={BUTTON_GHOST}
									disabled={isAppliedToAll}
									onClick={(): void => onApplyToAll(index)}
									data-testid={`variable-apply-all-${variable.name}`}
								>
									Apply to all
								</Button>
							</span>
						</TitleTooltip>
					) : null}
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						className={ICON_BUTTON}
						onClick={(): void => onEdit(index)}
						aria-label="Edit variable"
						data-testid={`variable-edit-${variable.name}`}
					>
						<PenLine aria-hidden="true" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						className={ICON_BUTTON}
						onClick={(): void => onRequestDelete(index)}
						aria-label="Delete variable"
						data-testid={`variable-delete-${variable.name}`}
					>
						<Trash2 aria-hidden="true" />
					</Button>
				</>
			)}
		</div>
	);
}

export default VariableRowActions;
