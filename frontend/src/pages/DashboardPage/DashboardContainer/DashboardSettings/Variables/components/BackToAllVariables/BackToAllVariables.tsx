import { Button } from 'components/ui/button';
import { cn } from 'lib/utils';
import { ArrowLeft } from 'lucide-react';

import { VariableFormProps } from '../../types';
import { BUTTON_GHOST } from '../../../components/settingsClassNames';

const BackToAllVariables = ({
	onClose,
}: {
	onClose: VariableFormProps['onClose'];
}): JSX.Element => {
	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className={cn(BUTTON_GHOST, 'tw:self-start tw:px-1.5')}
			onClick={onClose}
			data-testid="variable-form-back"
		>
			<ArrowLeft aria-hidden="true" />
			All variables
		</Button>
	);
};

export default BackToAllVariables;
