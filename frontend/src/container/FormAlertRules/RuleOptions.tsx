import { useTranslation } from 'react-i18next';
import type { DefaultOptionType } from 'antd/es/select';
import {
	getCategoryByOptionId,
	getCategorySelectOptionByName,
} from 'container/CreateAlertV2/AlertCondition/utils';
import { AlertDef } from 'types/api/alerts/def';
import { EQueryType } from 'types/common/dashboard';

import AnomalyFields from './ruleCondition/AnomalyFields';
import CompareFields from './ruleCondition/CompareFields';
import ConditionSummary from './ruleCondition/ConditionSummary';
import MoreOptions from './ruleCondition/MoreOptions';
import { FormContainer, StepHeading } from './styles';

import './RuleOptions.styles.scss';

function RuleOptions({
	alertDef,
	setAlertDef,
	queryCategory,
	queryOptions,
	yAxisUnit,
}: RuleOptionsProps): JSX.Element {
	const { t } = useTranslation('alerts');

	const isAnomaly =
		queryCategory !== EQueryType.PROM && alertDef.ruleType === 'anomaly_rule';
	const unitOptions = getCategorySelectOptionByName(
		getCategoryByOptionId(yAxisUnit),
	);
	const unitLabel = unitOptions.find(
		(option) => option.value === alertDef.condition.targetUnit,
	)?.label;
	const step3Label = alertDef.alertType === 'METRIC_BASED_ALERT' ? '3' : '2';

	return (
		<>
			<StepHeading>{t('alert_form_step3', { step: step3Label })}</StepHeading>
			<FormContainer>
				<div className="tw:flex tw:flex-col tw:gap-4">
					<CompareFields
						alertDef={alertDef}
						setAlertDef={setAlertDef}
						queryCategory={queryCategory}
						queryOptions={queryOptions}
						unitOptions={unitOptions}
					/>
					{isAnomaly && (
						<AnomalyFields alertDef={alertDef} setAlertDef={setAlertDef} />
					)}
					<ConditionSummary
						ruleType={isAnomaly ? alertDef.ruleType : 'threshold_rule'}
						queryName={alertDef.condition.selectedQueryName}
						op={alertDef.condition.op}
						target={alertDef.condition.target}
						unitLabel={typeof unitLabel === 'string' ? unitLabel : undefined}
						matchType={alertDef.condition.matchType}
						evalWindow={alertDef.evalWindow}
						seasonality={alertDef.condition.seasonality}
					/>
					<MoreOptions alertDef={alertDef} setAlertDef={setAlertDef} />
				</div>
			</FormContainer>
		</>
	);
}

interface RuleOptionsProps {
	alertDef: AlertDef;
	setAlertDef: (a: AlertDef) => void;
	queryCategory: EQueryType;
	queryOptions: DefaultOptionType[];
	yAxisUnit: string;
}
export default RuleOptions;
