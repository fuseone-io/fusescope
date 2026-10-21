import { Braces } from 'lucide-react';

import AddVariableButton from '../AddVariableButton';
import { EditingState } from '../../types';
import type { BrandedPermission } from 'lib/authz/hooks/useAuthZ/types';

const NoVariablesCard = ({
	checks,
	disabledTooltip,
	setIsEditing,
}: {
	checks: BrandedPermission[];
	disabledTooltip?: string;
	setIsEditing: React.Dispatch<React.SetStateAction<EditingState | null>>;
}): JSX.Element => {
	return (
		<div className="tw:flex tw:flex-col tw:items-center tw:gap-3 tw:rounded-[10px] tw:border tw:border-dashed tw:border-border tw:px-6 tw:py-10 tw:text-center">
			<span className="tw:flex tw:size-9 tw:items-center tw:justify-center tw:rounded-lg tw:bg-primary-soft tw:text-primary-ink">
				<Braces className="tw:size-4" aria-hidden="true" />
			</span>
			<div className="tw:flex tw:flex-col tw:gap-0.5">
				<span className="tw:text-sm tw:font-medium tw:text-foreground">
					No variables yet
				</span>
				<span className="tw:text-[13px] tw:text-subtle-foreground">
					Create a variable to parameterize your panel queries.
				</span>
			</div>
			<AddVariableButton
				checks={checks}
				disabledTooltip={disabledTooltip}
				setIsEditing={setIsEditing}
			/>
		</div>
	);
};

export default NoVariablesCard;
