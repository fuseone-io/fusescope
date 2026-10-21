import { useMemo } from 'react';
import { GetRuleHistoryTimeline200 } from 'api/generated/services/fuseScope.schemas';
import { labelsArrayToObject } from 'container/AlertHistory/utils/labelAdapters';
import { AlertRuleTimelineTableResponse } from 'types/api/alerts/def';

interface TimelineTableData {
	timelineData: AlertRuleTimelineTableResponse[] | undefined;
	totalItems: number;
	nextCursor: string | undefined;
}

export function useTimelineTableData(
	data: GetRuleHistoryTimeline200 | undefined,
): TimelineTableData {
	return useMemo(() => {
		const response = data?.data;
		const items: AlertRuleTimelineTableResponse[] | undefined =
			response?.items?.map((item) => {
				return {
					ruleID: item.ruleId,
					ruleName: item.ruleName,
					overallState: item.overallState as string,
					overallStateChanged: item.overallStateChanged,
					state: item.state as string,
					stateChanged: item.stateChanged,
					unixMilli: item.unixMilli,
					fingerprint: item.fingerprint,
					value: item.value,
					labels: labelsArrayToObject(item.labels),
					relatedLogsLink: item.relatedLogsLink,
					relatedTracesLink: item.relatedTracesLink,
				};
			});

		return {
			timelineData: items,
			totalItems: response?.total ?? 0,
			nextCursor: response?.nextCursor,
		};
	}, [data?.data]);
}
