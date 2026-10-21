import { useMemo } from 'react';
import { useGetAlertRuleDetailsTopContributors } from 'pages/AlertDetails/hooks';
import { labelsArrayToObject } from 'container/AlertHistory/utils/labelAdapters';
import HistoryDataState from 'container/AlertHistory/HistoryDataState/HistoryDataState';
import { AlertRuleStats, AlertRuleTopContributors } from 'types/api/alerts/def';

import TopContributorsCard from '../TopContributorsCard/TopContributorsCard';
import TopContributorsLoading from './TopContributorsLoading';

type TopContributorsRendererProps = {
	totalCurrentTriggers: AlertRuleStats['totalCurrentTriggers'];
};

function TopContributorsRenderer({
	totalCurrentTriggers,
}: TopContributorsRendererProps): JSX.Element {
	const { isLoading, isRefetching, isError, data, isValidRuleId, ruleId } =
		useGetAlertRuleDetailsTopContributors();

	// TODO(shaheer): render the DataStateRenderer inside the TopContributorsCard, it should display the title and view all
	const adaptedData = useMemo((): AlertRuleTopContributors[] | null => {
		if (!data?.data) {
			return null;
		}
		return data.data.map((contributor) => ({
			fingerprint: contributor.fingerprint,
			count: contributor.count,
			labels: labelsArrayToObject(contributor.labels),
			relatedLogsLink: contributor.relatedLogsLink ?? '',
			relatedTracesLink: contributor.relatedTracesLink ?? '',
		}));
	}, [data?.data]);

	return (
		<HistoryDataState
			isLoading={isLoading}
			isRefetching={isRefetching}
			isError={isError || !isValidRuleId || !ruleId}
			data={adaptedData}
			loading={<TopContributorsLoading />}
			className="tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised"
		>
			{(topContributorsData): JSX.Element => (
				<TopContributorsCard
					topContributorsData={topContributorsData}
					totalCurrentTriggers={totalCurrentTriggers}
				/>
			)}
		</HistoryDataState>
	);
}

export default TopContributorsRenderer;
