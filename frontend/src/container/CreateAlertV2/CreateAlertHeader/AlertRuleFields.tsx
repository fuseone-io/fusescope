import { useCallback, useMemo } from 'react';
import { Input } from 'components/ui/input';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { useAlertRuleOptional } from 'providers/Alert';
import { Labels } from 'types/api/alerts/def';

import { useCreateAlertState } from '../context';
import LabelsInput from './LabelsInput';

const FIELD_CLASS =
	'tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5 tw:text-[13px] tw:font-medium tw:text-foreground';

/** The rule name and labels, edited in the header band of the rule editor. */
function AlertRuleFields(): JSX.Element {
	const { alertState, setAlertState, isEditMode } = useCreateAlertState();
	const alertRuleContext = useAlertRuleOptional();
	const { currentQuery } = useQueryBuilder();

	const groupByLabels = useMemo(() => {
		const labels = new Array<string>();
		currentQuery.builder.queryData.forEach((query) => {
			query.groupBy.forEach((groupBy) => {
				labels.push(groupBy.key);
			});
		});
		return labels;
	}, [currentQuery]);

	// If the label key is a group by label, then it is not allowed to be used as a label key
	const validateLabelsKey = useCallback(
		(key: string): string | null => {
			if (groupByLabels.includes(key)) {
				return `Cannot use ${key} as a key`;
			}
			return null;
		},
		[groupByLabels],
	);

	return (
		<div className="fs-ui tw:flex tw:flex-wrap tw:items-start tw:gap-3 tw:font-sans">
			<div className={`${FIELD_CLASS} tw:flex-[1_1_420px]`}>
				<label htmlFor="alert-rule-name">Rule name</label>
				<Input
					id="alert-rule-name"
					type="text"
					value={alertState.name}
					onChange={(e): void => {
						const newName = e.target.value;
						setAlertState({ type: 'SET_ALERT_NAME', payload: newName });
						if (isEditMode && alertRuleContext?.setAlertRuleName) {
							alertRuleContext.setAlertRuleName(newName);
						}
					}}
					className="tw:bg-surface-raised tw:text-sm tw:dark:bg-surface-raised"
					placeholder="Enter alert rule name"
					data-testid="alert-name-input"
				/>
			</div>
			<div className={`${FIELD_CLASS} tw:flex-[1_1_360px]`}>
				<span>Labels</span>
				<LabelsInput
					labels={alertState.labels}
					onLabelsChange={(labels: Labels): void =>
						setAlertState({ type: 'SET_ALERT_LABELS', payload: labels })
					}
					validateLabelsKey={validateLabelsKey}
				/>
			</div>
		</div>
	);
}

export default AlertRuleFields;
