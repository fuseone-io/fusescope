import {
	AlertThresholdMatchType,
	AlertThresholdOperator,
	Threshold,
} from 'container/CreateAlertV2/context/types';
import { Query } from 'types/api/queryBuilder/queryBuilderData';

export type RumAlertTemplateId =
	| 'lcp_p75'
	| 'session_error_rate'
	| 'js_error_count';

export type RumAlertGroupBy = 'route' | 'release';

export interface RumAlertTarget {
	applicationId: string;
	applicationName: string;
	route?: string;
	groupBy?: RumAlertGroupBy;
	error?: { type: string; message: string };
}

/** What a template declares to the alert editor. */
export interface RumAlertPrefill {
	template: RumAlertTemplateId;
	ruleName: string;
	query: Query;
	unit?: string;
	selectedQuery: string;
	matchType: AlertThresholdMatchType;
	operator: AlertThresholdOperator;
	thresholds: Threshold[];
}

export interface RumAlertTemplateRef {
	template: RumAlertTemplateId;
	applicationId: string;
}
