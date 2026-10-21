import { Button } from 'components/ui/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from 'components/ui/dialog';
import { cn } from 'lib/utils';
import { textContainsVariableReference } from 'lib/dashboardVariables/variableReference';
import { Check, Loader2, X } from 'lucide-react';

import type {
	VariableImpactMode,
	VariableUsage,
} from '../utils/variableUsages';
import {
	BADGE_NEUTRAL,
	BUTTON_OUTLINE,
	BUTTON_SM,
	FIELD_TEXTAREA,
} from '../../components/settingsClassNames';
import { useVariableImpactState } from './useVariableImpactState';

const KIND_LABEL: Record<VariableUsage['kind'], string> = {
	builder: 'Query builder',
	promql: 'PromQL',
	clickhouse: 'ClickHouse',
	variable: 'Variable',
	text: 'Markdown body',
};

const CODE_FIELD = cn(
	FIELD_TEXTAREA,
	'tw:field-sizing-content tw:max-h-28 tw:font-mono tw:text-xs',
);

interface VariableImpactDialogProps {
	open: boolean;
	mode: VariableImpactMode;
	/** The variable being renamed/deleted (its current name). */
	variableName: string;
	/** The new name (rename mode only). */
	newName?: string;
	usages: VariableUsage[];
	isLoading: boolean;
	onConfirm: (resolvedUsages: VariableUsage[]) => void;
	onClose: () => void;
}

/**
 * Blocks a rename/delete of a referenced variable behind a review step: lists
 * every usage across panel queries (builder / PromQL / ClickHouse) and other
 * variables, shows the current vs resulting query, and lets the user edit each
 * result or exclude it before applying.
 */
function VariableImpactDialog({
	open,
	mode,
	variableName,
	newName,
	usages,
	isLoading,
	onConfirm,
	onClose,
}: VariableImpactDialogProps): JSX.Element {
	const { rows, setResultingText, toggleIncluded, resolvedUsages } =
		useVariableImpactState(usages, open);

	const isRename = mode === 'rename';
	const isDelete = mode === 'delete';
	const count = usages.length;
	const plural = count === 1 ? '' : 's';
	let intro: string;
	let title: string;
	if (isRename) {
		intro = `$${variableName} is used in ${count} place${plural}. Review the updated queries before renaming to $${newName}.`;
		title = `Rename $${variableName}`;
	} else if (isDelete) {
		intro = `$${variableName} is used in ${count} place${plural}. Edit or remove each usage before deleting.`;
		title = `Delete $${variableName}`;
	} else {
		intro = `Applying $${variableName} can update up to ${count} panel quer${count === 1 ? 'y' : 'ies'}. Review the changes before applying.`;
		title = `Apply $${variableName} to panels`;
	}
	const confirmLabel = isRename ? 'Rename' : isDelete ? 'Delete' : 'Apply';

	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen): void => {
				if (!isOpen) {
					onClose();
				}
			}}
		>
			<DialogContent showCloseButton={false} className="tw:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="tw:text-base">{title}</DialogTitle>
					<DialogDescription>{intro}</DialogDescription>
				</DialogHeader>
				<DialogBody className="tw:max-h-[60vh] tw:gap-3 tw:overflow-y-auto">
					{rows.map((row) => {
						// Only warn on delete: an apply result is meant to reference the variable.
						const stillReferences =
							isDelete &&
							row.included &&
							textContainsVariableReference(row.resultingText, variableName);
						const checkboxId = `variable-impact-include-${row.id}`;
						return (
							<div
								key={row.id}
								className="tw:flex tw:flex-col tw:gap-2 tw:rounded-[10px] tw:border tw:border-border tw:p-3"
								data-testid={`variable-impact-row-${row.id}`}
							>
								<div className="tw:flex tw:items-center tw:justify-between tw:gap-2">
									<label
										htmlFor={checkboxId}
										className="tw:flex tw:min-w-0 tw:cursor-pointer tw:items-center tw:gap-2 tw:text-[13px] tw:font-medium tw:text-foreground"
									>
										<input
											id={checkboxId}
											type="checkbox"
											checked={row.included}
											onChange={(): void => toggleIncluded(row.id)}
											data-testid={checkboxId}
											className="tw:size-4 tw:flex-none tw:cursor-pointer tw:accent-primary"
										/>
										<span className="tw:truncate">{row.sourceLabel}</span>
									</label>
									<span className={BADGE_NEUTRAL}>{KIND_LABEL[row.kind]}</span>
								</div>
								<div className="tw:flex tw:flex-col tw:gap-1">
									<span className="tw:text-[11px] tw:font-medium tw:tracking-wide tw:text-subtle-foreground tw:uppercase">
										Current
									</span>
									<textarea
										className={cn(CODE_FIELD, 'tw:bg-surface-sunken')}
										value={row.currentText}
										aria-label={`Current ${row.sourceLabel}`}
										disabled
										readOnly
										rows={1}
									/>
								</div>
								<div className="tw:flex tw:flex-col tw:gap-1">
									<span className="tw:text-[11px] tw:font-medium tw:tracking-wide tw:text-subtle-foreground tw:uppercase">
										Result
									</span>
									<textarea
										className={CODE_FIELD}
										value={row.resultingText}
										aria-label={`Result ${row.sourceLabel}`}
										disabled={!row.included}
										rows={1}
										onChange={(e): void => setResultingText(row.id, e.target.value)}
										data-testid={`variable-impact-result-${row.id}`}
									/>
									{stillReferences ? (
										<span className="tw:text-xs tw:text-warning-ink">
											Still references ${variableName}
										</span>
									) : null}
								</div>
							</div>
						);
					})}
				</DialogBody>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className={BUTTON_OUTLINE}
						onClick={onClose}
						data-testid="variable-impact-cancel"
					>
						<X aria-hidden="true" />
						Cancel
					</Button>
					<Button
						type="button"
						variant={isDelete ? 'destructive' : 'default'}
						size="sm"
						className={cn(BUTTON_SM, !isDelete && 'tw:hover:bg-primary-strong')}
						disabled={isLoading}
						onClick={(): void => onConfirm(resolvedUsages)}
						data-testid="variable-impact-confirm"
					>
						{isLoading ? (
							<Loader2 className="tw:animate-spin" aria-hidden="true" />
						) : (
							<Check aria-hidden="true" />
						)}
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default VariableImpactDialog;
