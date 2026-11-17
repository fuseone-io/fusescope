import LabelChipsInput from 'components/Alerts/LabelChipsInput/LabelChipsInput';

import { LabelsInputProps } from './types';

function LabelsInput({
	labels,
	onLabelsChange,
	validateLabelsKey,
}: LabelsInputProps): JSX.Element {
	return (
		<LabelChipsInput
			labels={labels}
			onChange={onLabelsChange}
			validateKey={validateLabelsKey}
		/>
	);
}

export default LabelsInput;
