import { type ChangeEvent, type ReactNode, useEffect, useState } from 'react';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from 'components/ui/popover';
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';

import styles from './ViewsRail.module.scss';

export const VIEW_NAME_MAX_LENGTH = 64;

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (name: string) => void;
	trigger: ReactNode;
	tooltip: string;
	title: string;
	confirmLabel: string;
	initialName?: string;
	testIdPrefix?: string;
}

// Name-input popover shared by "save as view" and "rename view"; enforces the
// view-name length cap in one place.
function ViewNamePopover({
	open,
	onOpenChange,
	onSubmit,
	trigger,
	tooltip,
	title,
	confirmLabel,
	initialName = '',
	testIdPrefix = 'view-name',
}: Props): JSX.Element {
	const [name, setName] = useState(initialName);

	useEffect(() => {
		if (open) {
			setName(initialName);
		}
	}, [open, initialName]);

	const trimmed = name.trim();
	const canSave = trimmed.length > 0 && trimmed.length <= VIEW_NAME_MAX_LENGTH;

	const handleSave = (): void => {
		if (canSave) {
			onSubmit(trimmed);
			onOpenChange(false);
		}
	};

	const disabledReason =
		trimmed.length === 0
			? 'Enter a view name first'
			: `Use at most ${VIEW_NAME_MAX_LENGTH} characters`;

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<TitleTooltip title={open ? undefined : tooltip}>
				<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			</TitleTooltip>
			<PopoverContent align="start" className="tw:w-auto tw:p-3">
				<div className={styles.savePopover}>
					<div className={styles.saveTitle}>{title}</div>
					<label htmlFor={`${testIdPrefix}-name`} className={styles.saveLabel}>
						Name
					</label>
					<Input
						id={`${testIdPrefix}-name`}
						value={name}
						autoFocus
						maxLength={VIEW_NAME_MAX_LENGTH}
						placeholder="e.g. Prod alerts"
						data-testid={`${testIdPrefix}-name`}
						className="tw:h-8 tw:border-input tw:bg-surface-raised tw:text-[13px] tw:dark:bg-surface-raised"
						onChange={(e: ChangeEvent<HTMLInputElement>): void =>
							setName(e.target.value)
						}
						onKeyDown={(e): void => {
							if (e.key === 'Enter') {
								handleSave();
							}
						}}
					/>
					<div className={styles.saveActions}>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={(): void => onOpenChange(false)}
						>
							Cancel
						</Button>
						<TitleTooltip title={canSave ? undefined : disabledReason}>
							<span className="tw:inline-flex">
								<Button
									type="button"
									size="sm"
									disabled={!canSave}
									data-testid={`${testIdPrefix}-confirm`}
									onClick={handleSave}
								>
									{confirmLabel}
								</Button>
							</span>
						</TitleTooltip>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}

export default ViewNamePopover;
