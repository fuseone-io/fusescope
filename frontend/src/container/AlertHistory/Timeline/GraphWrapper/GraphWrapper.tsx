import { useMemo } from 'react';
import { Skeleton } from 'components/ui/skeleton';
import HistoryDataState from 'container/AlertHistory/HistoryDataState/HistoryDataState';
import useUrlQuery from 'hooks/useUrlQuery';
import { useGetAlertRuleDetailsTimelineGraphData } from 'pages/AlertDetails/hooks';
import { AlertRuleTimelineGraphResponse } from 'types/api/alerts/def';

import Graph from '../Graph/Graph';

function GraphWrapper({
	totalCurrentTriggers,
}: {
	totalCurrentTriggers: number;
}): JSX.Element {
	const urlQuery = useUrlQuery();

	const relativeTime = urlQuery.get('relativeTime');

	const { isLoading, isRefetching, isError, data, isValidRuleId, ruleId } =
		useGetAlertRuleDetailsTimelineGraphData();

	const adaptedData = useMemo((): AlertRuleTimelineGraphResponse[] | null => {
		if (!data?.data) {
			return null;
		}
		return data.data.map((item) => ({
			start: item.start,
			end: item.end,
			state: item.state as AlertRuleTimelineGraphResponse['state'],
		}));
	}, [data?.data]);

	return (
		<div
			className="tw:flex tw:flex-col tw:gap-3 tw:border-b tw:border-border tw:px-5 tw:pt-4 tw:pb-2"
			data-testid="timeline-graph"
		>
			<span
				className="fs-ui tw:inline-flex tw:h-6 tw:w-max tw:items-center tw:rounded-md tw:border tw:border-border tw:bg-surface-sunken tw:px-2 tw:font-sans tw:text-xs tw:text-muted-foreground tw:tabular-nums"
				data-testid="timeline-graph-title"
			>
				{totalCurrentTriggers} triggers in {relativeTime}
			</span>
			<div className="tw:min-h-[85px]">
				<HistoryDataState
					isLoading={isLoading}
					isError={isError || !isValidRuleId || !ruleId}
					isRefetching={isRefetching}
					data={adaptedData}
					loading={
						<Skeleton
							data-testid="timeline-graph-loading"
							className="tw:h-[85px] tw:w-full tw:bg-muted"
						/>
					}
				>
					{(data): JSX.Element => <Graph type="horizontal" data={data} />}
				</HistoryDataState>
			</div>
		</div>
	);
}

export default GraphWrapper;
