import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { ActionMode } from 'types/api/pipeline/def';

function ModeAndConfiguration({
	isActionMode,
	version,
}: ModeAndConfigurationType): JSX.Element {
	const actionMode = isActionMode === ActionMode.Editing;

	return (
		<div className="fs-ui tw:flex tw:items-center tw:gap-3 tw:font-sans tw:text-[13px] tw:text-muted-foreground">
			<span className="tw:inline-flex tw:items-center tw:gap-1.5">
				Mode
				<StatusBadge tone={actionMode ? 'warning' : 'success'} dot>
					{actionMode ? 'Editing' : 'Viewing'}
				</StatusBadge>
			</span>
			<span aria-hidden="true" className="tw:h-4 tw:w-px tw:bg-border" />
			<span>
				Configuration version{' '}
				<span className="tw:font-mono tw:text-foreground tw:tabular-nums">
					{version}
				</span>
			</span>
		</div>
	);
}

export interface ModeAndConfigurationType {
	isActionMode: string;
	version: string | number;
}

export default ModeAndConfiguration;
