import { Plus } from '@signozhq/icons';
import AuthZButton from 'lib/authz/components/AuthZButton/AuthZButton';
import type { BrandedPermission } from 'lib/authz/hooks/useAuthZ/types';

const AddVariableButton = ({
	checks,
	disabledTooltip,
	setIsEditing,
}: {
	checks: BrandedPermission[];
	disabledTooltip?: string;
	setIsEditing: (state: { type: 'new' }) => void;
}): JSX.Element => (
	// The shared button takes no class, so the dashed outline comes from here.
	<span className="tw:inline-flex tw:[&_button]:rounded-lg! tw:[&_button]:border-dashed! tw:[&_button]:border-input!">
		<AuthZButton
			checks={checks}
			disabledTooltip={disabledTooltip}
			variant="outlined"
			color="secondary"
			prefix={<Plus size={14} />}
			size="sm"
			onClick={(): void => setIsEditing({ type: 'new' })}
			testId="add-variable"
		>
			Add variable
		</AuthZButton>
	</span>
);

export default AddVariableButton;
