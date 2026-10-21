import { useEffect, useMemo } from 'react';
import { useGetAlertRuleDetailsStats } from 'pages/AlertDetails/hooks';
import HistoryDataState from 'container/AlertHistory/HistoryDataState/HistoryDataState';
import { StatsTimeSeriesItem } from 'types/api/alerts/def';

import AverageResolutionCard from '../AverageResolutionCard/AverageResolutionCard';
import StatsCard from '../StatsCard/StatsCard';
import TotalTriggeredCard from '../TotalTriggeredCard/TotalTriggeredCard';
import StatsLoading from './StatsLoading';

const hasTotalTriggeredStats = (
	totalCurrentTriggers: number | string,
	totalPastTriggers: number | string,
): boolean =>
	(Number(totalCurrentTriggers) > 0 && Number(totalPastTriggers) > 0) ||
	Number(totalCurrentTriggers) > 0;

const hasAvgResolutionTimeStats = (
	currentAvgResolutionTime: number | string,
	pastAvgResolutionTime: number | string,
): boolean =>
	(Number(currentAvgResolutionTime) > 0 && Number(pastAvgResolutionTime) > 0) ||
	Number(currentAvgResolutionTime) > 0;

type StatsCardsRendererProps = {
	setTotalCurrentTriggers: (value: number) => void;
};

// TODO(shaheer): render the DataStateRenderer inside the TotalTriggeredCard/AverageResolutionCard, it should display the title
type AdaptedStatsData = {
	totalCurrentTriggers: number;
	totalPastTriggers: number;
	currentAvgResolutionTime: string;
	pastAvgResolutionTime: string;
	currentTriggersSeries: StatsTimeSeriesItem[];
	currentAvgResolutionTimeSeries: StatsTimeSeriesItem[];
};

function StatsCardsRenderer({
	setTotalCurrentTriggers,
}: StatsCardsRendererProps): JSX.Element {
	const { isLoading, isRefetching, isError, data, isValidRuleId, ruleId } =
		useGetAlertRuleDetailsStats();

	const adaptedData = useMemo((): AdaptedStatsData | null => {
		if (!data?.data) {
			return null;
		}
		const statsData = data.data;

		const adaptTimeSeries = (
			series: typeof statsData.currentTriggersSeries,
		): StatsTimeSeriesItem[] =>
			series?.values?.map((item) => ({
				timestamp: item.timestamp ?? 0,
				value: String(item.value ?? 0),
			})) ?? [];

		return {
			totalCurrentTriggers: statsData.totalCurrentTriggers,
			totalPastTriggers: statsData.totalPastTriggers,
			currentAvgResolutionTime: String(statsData.currentAvgResolutionTime),
			pastAvgResolutionTime: String(statsData.pastAvgResolutionTime),
			currentTriggersSeries: adaptTimeSeries(statsData.currentTriggersSeries),
			currentAvgResolutionTimeSeries: adaptTimeSeries(
				statsData.currentAvgResolutionTimeSeries,
			),
		};
	}, [data?.data]);

	useEffect(() => {
		if (adaptedData?.totalCurrentTriggers !== undefined) {
			setTotalCurrentTriggers(adaptedData.totalCurrentTriggers);
		}
	}, [adaptedData, setTotalCurrentTriggers]);

	return (
		<HistoryDataState
			isLoading={isLoading}
			isRefetching={isRefetching}
			isError={isError || !isValidRuleId || !ruleId}
			data={adaptedData}
			loading={<StatsLoading />}
			className="tw:col-span-full tw:bg-surface-raised"
		>
			{(data): JSX.Element => {
				const {
					currentAvgResolutionTime,
					pastAvgResolutionTime,
					totalCurrentTriggers,
					totalPastTriggers,
					currentAvgResolutionTimeSeries,
					currentTriggersSeries,
				} = data;

				return (
					<>
						{hasTotalTriggeredStats(totalCurrentTriggers, totalPastTriggers) ? (
							<TotalTriggeredCard
								totalCurrentTriggers={totalCurrentTriggers}
								totalPastTriggers={totalPastTriggers}
								timeSeries={currentTriggersSeries}
							/>
						) : (
							<StatsCard
								title="Total Triggered"
								isEmpty
								emptyMessage="None Triggered."
							/>
						)}

						{hasAvgResolutionTimeStats(
							currentAvgResolutionTime,
							pastAvgResolutionTime,
						) ? (
							<AverageResolutionCard
								currentAvgResolutionTime={currentAvgResolutionTime}
								pastAvgResolutionTime={pastAvgResolutionTime}
								timeSeries={currentAvgResolutionTimeSeries}
							/>
						) : (
							<StatsCard
								title="Avg. Resolution Time"
								isEmpty
								emptyMessage="No Resolutions."
							/>
						)}
					</>
				);
			}}
		</HistoryDataState>
	);
}

export default StatsCardsRenderer;
