import { ReactNode } from 'react';
import type { DefaultOptionType } from 'antd/es/select';
import { AlertDef } from 'types/api/alerts/def';
import { EQueryType } from 'types/common/dashboard';

export type Translate = (
	key: string,
	options?: Record<string, string | number>,
) => string;

export interface ConditionSummaryInput {
	ruleType?: string;
	queryName?: string;
	op?: string;
	target?: number;
	unitLabel?: string;
	matchType?: string;
	evalWindow?: string;
	seasonality?: string;
}

export interface ConditionFieldsProps {
	alertDef: AlertDef;
	setAlertDef: (a: AlertDef) => void;
}

export interface CompareFieldsProps extends ConditionFieldsProps {
	queryCategory: EQueryType;
	queryOptions: DefaultOptionType[];
	unitOptions: DefaultOptionType[];
}

export interface ConditionFieldProps {
	label: string;
	htmlFor: string;
	children: ReactNode;
}

export interface ConditionGroupProps {
	title: string;
	testId: string;
	children: ReactNode;
}
