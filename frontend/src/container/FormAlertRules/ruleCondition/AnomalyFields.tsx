import { useTranslation } from 'react-i18next';
import { Select } from 'antd';
import { defaultSeasonality } from 'types/api/alerts/def';
import { popupContainer } from 'utils/selectPopupContainer';

import CompareOpSelect from './CompareOpSelect';
import { conditionHandlers } from './conditionHandlers';
import ConditionField from './ConditionField';
import ConditionGroup from './ConditionGroup';
import {
	ANOMALY_OPS,
	DEVIATION_OPTIONS,
	SEASONALITY_OPTIONS,
} from './constants';
import { ConditionFieldsProps } from './types';

function AnomalyFields({
	alertDef,
	setAlertDef,
}: ConditionFieldsProps): JSX.Element {
	const { t } = useTranslation('alerts');
	const handlers = conditionHandlers(alertDef, setAlertDef);

	return (
		<ConditionGroup
			title={t('condition_group_anomaly')}
			testId="alert-condition-group-anomaly"
		>
			<ConditionField
				label={t('condition_field_deviations')}
				htmlFor="alert-condition-deviations"
			>
				<Select
					id="alert-condition-deviations"
					className="tw:w-full"
					getPopupContainer={popupContainer}
					defaultValue={3}
					data-testid="alert-anomaly-deviation-select"
					value={alertDef.condition.target}
					onChange={handlers.onChangeDeviation}
				>
					{DEVIATION_OPTIONS.map((deviation) => (
						<Select.Option key={deviation} value={deviation}>
							{deviation}
						</Select.Option>
					))}
				</Select>
			</ConditionField>
			<ConditionField
				label={t('condition_field_direction')}
				htmlFor="alert-condition-direction"
			>
				<CompareOpSelect
					id="alert-condition-direction"
					ops={ANOMALY_OPS}
					value={alertDef.condition?.op}
					onChange={handlers.onChangeOp}
				/>
			</ConditionField>
			<ConditionField
				label={t('condition_field_seasonality')}
				htmlFor="alert-condition-seasonality"
			>
				<Select
					id="alert-condition-seasonality"
					className="tw:w-full"
					getPopupContainer={popupContainer}
					defaultValue={defaultSeasonality}
					data-testid="alert-anomaly-seasonality-select"
					value={alertDef.condition.seasonality}
					onChange={handlers.onChangeSeasonality}
				>
					{SEASONALITY_OPTIONS.map((option) => (
						<Select.Option key={option.value} value={option.value}>
							{option.label}
						</Select.Option>
					))}
				</Select>
			</ConditionField>
		</ConditionGroup>
	);
}

export default AnomalyFields;
