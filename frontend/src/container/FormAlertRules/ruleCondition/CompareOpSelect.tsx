import { useTranslation } from 'react-i18next';
import { Select } from 'antd';
import { defaultCompareOp } from 'types/api/alerts/def';
import { popupContainer } from 'utils/selectPopupContainer';

import { OP_LABEL_KEYS } from './constants';

interface CompareOpSelectProps {
	id: string;
	ops: string[];
	value: string | undefined;
	onChange: (value: unknown) => void;
}

function CompareOpSelect({
	id,
	ops,
	value,
	onChange,
}: CompareOpSelectProps): JSX.Element {
	const { t } = useTranslation('alerts');

	return (
		<Select
			id={id}
			className="tw:w-full"
			getPopupContainer={popupContainer}
			defaultValue={defaultCompareOp}
			value={value}
			data-testid="alert-threshold-op-select"
			onChange={onChange}
		>
			{ops.map((op) => (
				<Select.Option key={op} value={op}>
					{t(OP_LABEL_KEYS[op])}
				</Select.Option>
			))}
		</Select>
	);
}

export default CompareOpSelect;
