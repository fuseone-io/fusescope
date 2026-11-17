import { useTranslation } from 'react-i18next';
import { InputNumber, Select } from 'antd';
import { defaultEvalWindow, defaultMatchType } from 'types/api/alerts/def';
import { EQueryType } from 'types/common/dashboard';
import { popupContainer } from 'utils/selectPopupContainer';

import CompareOpSelect from './CompareOpSelect';
import { conditionHandlers } from './conditionHandlers';
import ConditionField from './ConditionField';
import ConditionGroup from './ConditionGroup';
import {
	ANOMALY_MATCH_TYPES,
	ANOMALY_OPS,
	EVAL_WINDOW_OPTIONS,
	MATCH_TYPE_LABEL_KEYS,
	PROM_EVAL_WINDOW_OPTIONS,
	THRESHOLD_MATCH_TYPES,
	THRESHOLD_OPS,
} from './constants';
import { CompareFieldsProps } from './types';

function CompareFields({
	alertDef,
	setAlertDef,
	queryCategory,
	queryOptions,
	unitOptions,
}: CompareFieldsProps): JSX.Element {
	const { t } = useTranslation('alerts');
	const handlers = conditionHandlers(alertDef, setAlertDef);
	const isAnomaly = alertDef.ruleType === 'anomaly_rule';
	const windows =
		queryCategory === EQueryType.PROM
			? PROM_EVAL_WINDOW_OPTIONS
			: EVAL_WINDOW_OPTIONS;
	const matchTypes = isAnomaly ? ANOMALY_MATCH_TYPES : THRESHOLD_MATCH_TYPES;
	const showOp = !isAnomaly || queryCategory === EQueryType.PROM;

	return (
		<ConditionGroup
			title={t('condition_group_compare')}
			testId="alert-condition-group-compare"
		>
			<ConditionField
				label={t('condition_field_query')}
				htmlFor="alert-condition-query"
			>
				<Select
					id="alert-condition-query"
					className="tw:w-full"
					getPopupContainer={popupContainer}
					allowClear
					showSearch
					options={queryOptions}
					placeholder={t('selected_query_placeholder')}
					value={alertDef.condition.selectedQueryName}
					onChange={handlers.onChangeSelectedQueryName}
					data-testid="alert-condition-query-select"
				/>
			</ConditionField>
			{showOp && (
				<ConditionField
					label={t('condition_field_operator')}
					htmlFor="alert-condition-operator"
				>
					<CompareOpSelect
						id="alert-condition-operator"
						ops={isAnomaly ? ANOMALY_OPS : THRESHOLD_OPS}
						value={alertDef.condition?.op}
						onChange={handlers.onChangeOp}
					/>
				</ConditionField>
			)}
			{!isAnomaly && (
				<>
					<ConditionField
						label={t('condition_field_threshold')}
						htmlFor="alert-condition-threshold"
					>
						<div className="tw:flex tw:gap-2">
							<InputNumber
								id="alert-condition-threshold"
								className="tw:min-w-0 tw:flex-1"
								value={alertDef?.condition?.target}
								onChange={handlers.onChangeTarget}
								type="number"
								data-testid="alert-threshold-target-input"
								onWheel={(e): void => e.currentTarget.blur()}
							/>
							<Select
								className="rule-unit-selector"
								aria-label={t('field_unit')}
								getPopupContainer={popupContainer}
								allowClear
								showSearch
								options={unitOptions}
								placeholder={t('field_unit')}
								value={alertDef.condition.targetUnit || undefined}
								onChange={handlers.onChangeUnit}
							/>
						</div>
					</ConditionField>
				</>
			)}
			<ConditionField
				label={t('condition_field_window')}
				htmlFor="alert-condition-window"
			>
				<Select
					id="alert-condition-window"
					className="tw:w-full"
					getPopupContainer={popupContainer}
					defaultValue={defaultEvalWindow}
					value={alertDef.evalWindow}
					onChange={handlers.onChangeEvalWindow}
					data-testid="alert-eval-window-select"
				>
					{windows.map((option) => (
						<Select.Option key={option.value} value={option.value}>
							{t(option.labelKey)}
						</Select.Option>
					))}
				</Select>
			</ConditionField>
			<ConditionField
				label={t('condition_field_trigger')}
				htmlFor="alert-condition-trigger"
			>
				<Select
					id="alert-condition-trigger"
					className="tw:w-full"
					getPopupContainer={popupContainer}
					defaultValue={defaultMatchType}
					value={alertDef.condition?.matchType}
					data-testid="alert-threshold-match-type-select-v1"
					onChange={handlers.onChangeMatchType}
				>
					{matchTypes.map((matchType) => (
						<Select.Option key={matchType} value={matchType}>
							{t(MATCH_TYPE_LABEL_KEYS[matchType])}
						</Select.Option>
					))}
				</Select>
			</ConditionField>
		</ConditionGroup>
	);
}

export default CompareFields;
