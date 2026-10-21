import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { Button } from 'components/ui/button';
import { LoaderCircle } from 'lucide-react';

import { useCanManageAttributeMapping } from '../../hooks/useCanManageAttributeMapping';

interface AttributeMappingActionsProps {
	isDirty: boolean;
	isSaving: boolean;
	/** What changed, e.g. "1 mapping changed in gen_ai.llm". */
	summary: string | null;
	onDiscard: () => void;
	onSave: () => void;
}

/** The unsaved-changes bar: what is staged, and Discard / Save changes. */
function AttributeMappingActions({
	isDirty,
	isSaving,
	summary,
	onDiscard,
	onSave,
}: AttributeMappingActionsProps): JSX.Element | null {
	const canManage = useCanManageAttributeMapping();

	if (!canManage || !isDirty) {
		return null;
	}

	return (
		<div
			role="status"
			data-testid="unsaved-changes"
			className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:px-4 tw:py-2.5 tw:font-sans"
		>
			<span className="tw:flex tw:min-w-0 tw:items-center tw:gap-2 tw:text-[13px] tw:text-muted-foreground">
				<StatusBadge tone="warning">Unsaved</StatusBadge>
				<span className="translate-safe">
					{summary ?? 'Changes are staged until you save them.'}
				</span>
			</span>
			<div className="tw:flex tw:gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={onDiscard}
					disabled={isSaving}
					title={isSaving ? 'Wait for the save to finish' : undefined}
					data-testid="discard-changes-btn"
				>
					Discard
				</Button>
				<Button
					type="button"
					size="sm"
					onClick={onSave}
					disabled={isSaving}
					data-testid="save-changes-btn"
				>
					{isSaving && <LoaderCircle className="tw:animate-spin" />}
					<span className="translate-safe">
						{isSaving ? 'Saving…' : 'Save changes'}
					</span>
				</Button>
			</div>
		</div>
	);
}

export default AttributeMappingActions;
