import { Label } from 'components/ui/label';

import { ConditionFieldProps } from './types';

function ConditionField({
	label,
	htmlFor,
	children,
}: ConditionFieldProps): JSX.Element {
	return (
		<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5">
			<Label
				htmlFor={htmlFor}
				className="fs-ui tw:font-sans tw:text-xs tw:text-muted-foreground"
			>
				{label}
			</Label>
			{children}
		</div>
	);
}

export default ConditionField;
