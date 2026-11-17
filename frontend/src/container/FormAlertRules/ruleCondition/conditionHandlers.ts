import { InputNumberProps, SelectProps } from 'antd';
import {
	AlertDef,
	defaultCompareOp,
	defaultMatchType,
} from 'types/api/alerts/def';

export interface ConditionHandlers {
	onChangeSelectedQueryName: (value: unknown) => void;
	onChangeOp: (value: unknown) => void;
	onChangeMatchType: (value: unknown) => void;
	onChangeEvalWindow: (value: unknown) => void;
	onChangeSeasonality: (value: unknown) => void;
	onChangeDeviation: (value: unknown) => void;
	onChangeTarget: InputNumberProps['onChange'];
	onChangeUnit: SelectProps['onChange'];
}

export function conditionHandlers(
	alertDef: AlertDef,
	setAlertDef: (a: AlertDef) => void,
): ConditionHandlers {
	const setCondition = (patch: Partial<AlertDef['condition']>): void => {
		setAlertDef({
			...alertDef,
			condition: { ...alertDef.condition, ...patch },
		});
	};

	return {
		onChangeSelectedQueryName: (value): void => {
			if (typeof value === 'string') {
				setCondition({ selectedQueryName: value });
			}
		},
		onChangeOp: (value): void => {
			setCondition({ op: (value as string) || '' });
		},
		onChangeMatchType: (value): void => {
			setCondition({
				matchType: (value as string) || alertDef.condition?.matchType,
			});
		},
		onChangeEvalWindow: (value): void => {
			setAlertDef({
				...alertDef,
				evalWindow: (value as string) || alertDef.evalWindow,
			});
		},
		onChangeSeasonality: (value): void => {
			setCondition({
				seasonality: (value as string) || alertDef.condition.seasonality,
			});
		},
		onChangeDeviation: (value): void => {
			if (typeof value !== 'number') {
				return;
			}
			const target = value || alertDef.condition.target || 3;
			setCondition({ target: Number(target) });
		},
		onChangeTarget: (value): void => {
			setCondition({
				op: alertDef.condition?.op || defaultCompareOp,
				matchType: alertDef.condition?.matchType || defaultMatchType,
				target: Number(value) || 0,
			});
		},
		onChangeUnit: (value): void => {
			setCondition({ targetUnit: value as string });
		},
	};
}
