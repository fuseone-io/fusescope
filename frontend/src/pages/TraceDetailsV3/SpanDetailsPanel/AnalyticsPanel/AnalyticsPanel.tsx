import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Tabs } from '@signozhq/ui/tabs';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from 'components/ui/sheet';
import { useIsDarkMode } from 'hooks/useDarkMode';
import useGetTraceAggregations from 'hooks/trace/useGetTraceAggregations';
import { generateColorPair } from 'pages/TraceDetailsV3/utils/generateColorPair';
import {
	SpantypesSpanAggregationDTO,
	TelemetrytypesTelemetryFieldKeyDTO,
} from 'api/generated/services/fuseScope.schemas';
import { TraceDetailV3URLProps } from 'types/api/trace/getTraceV3';

import { useTraceStore } from '../../stores/traceStore';
import {
	AGGREGATIONS,
	getAggregationMap as findAggregationMap,
} from '../../utils/aggregations';
import AnalyticsTabContent, { AnalyticsRow } from './AnalyticsTabContent';

import styles from './AnalyticsPanel.module.scss';

interface AnalyticsPanelProps {
	isOpen: boolean;
	onClose: () => void;
	onTabChange: (tab: string) => void;
}

function AnalyticsPanel({
	isOpen,
	onClose,
	onTabChange,
}: AnalyticsPanelProps): JSX.Element | null {
	const { id: traceId } = useParams<TraceDetailV3URLProps>();
	const colorByField = useTraceStore((s) => s.colorByField);
	const colorByFieldName = colorByField.name;
	const isDarkMode = useIsDarkMode();

	// Fetch exec-time % + span count for the current color-by field only, and
	// only while the panel is open. Changing the field refetches via the key.
	const aggregationsRequest = useMemo<SpantypesSpanAggregationDTO[]>(() => {
		// v5 TelemetryFieldKey and the generated DTO are runtime-identical; only
		// the literal-union vs enum nominal types differ
		const field = colorByField as unknown as TelemetrytypesTelemetryFieldKeyDTO;
		return [
			{ field, aggregation: AGGREGATIONS.EXEC_TIME_PCT },
			{ field, aggregation: AGGREGATIONS.SPAN_COUNT },
		];
	}, [colorByField]);

	const { data, isLoading, isError } = useGetTraceAggregations({
		traceId: traceId || '',
		aggregations: aggregationsRequest,
		enabled: isOpen,
	});

	const aggregations = data?.data.aggregations;

	const execTimePct = useMemo(
		() =>
			findAggregationMap(
				aggregations,
				AGGREGATIONS.EXEC_TIME_PCT,
				colorByFieldName,
			),
		[aggregations, colorByFieldName],
	);

	const spanCounts = useMemo(
		() =>
			findAggregationMap(aggregations, AGGREGATIONS.SPAN_COUNT, colorByFieldName),
		[aggregations, colorByFieldName],
	);

	const execTimeRows = useMemo<AnalyticsRow[]>(() => {
		if (!execTimePct) {
			return [];
		}
		return Object.entries(execTimePct)
			.sort(([, a], [, b]) => b - a)
			.map(([group, percentage]) => {
				const pair = generateColorPair(group);
				return {
					group,
					color: isDarkMode ? pair.color : pair.colorDark,
					widthPct: Math.min(percentage, 100),
					label: `${percentage.toFixed(2)}%`,
				};
			});
	}, [execTimePct, isDarkMode]);

	const spanCountRows = useMemo<AnalyticsRow[]>(() => {
		if (!spanCounts) {
			return [];
		}
		const max = Math.max(...Object.values(spanCounts), 1);
		return Object.entries(spanCounts)
			.sort(([, a], [, b]) => b - a)
			.map(([group, count]) => {
				const pair = generateColorPair(group);
				return {
					group,
					color: isDarkMode ? pair.color : pair.colorDark,
					widthPct: (count / max) * 100,
					label: String(count),
				};
			});
	}, [spanCounts, isDarkMode]);

	if (!isOpen) {
		return null;
	}

	return (
		<Sheet
			open
			onOpenChange={(open): void => {
				if (!open) {
					onClose();
				}
			}}
		>
			<SheetContent
				side="right"
				className="fs-ui tw:w-[400px] tw:max-w-full tw:gap-0 tw:font-sans tw:sm:max-w-[400px]"
			>
				<SheetHeader className="tw:border-b tw:border-border tw:px-5 tw:py-4">
					<SheetTitle className="tw:text-base">Analytics</SheetTitle>
					<SheetDescription className="tw:text-xs">
						Execution time and span count by {colorByFieldName}
					</SheetDescription>
				</SheetHeader>
				<div className={styles.body} data-testid="trace-analytics-panel">
					<Tabs
						variant="primary"
						orientation="horizontal"
						alignment="start"
						className={styles.tabsScroll}
						defaultValue="exec-time"
						onChange={onTabChange}
						noTabContentPadding
						items={[
							{
								key: 'exec-time',
								label: '% exec time',
								children: (
									<div className={styles.tabsScroll}>
										<AnalyticsTabContent
											isLoading={isLoading}
											isError={isError}
											fieldName={colorByFieldName}
											rows={execTimeRows}
											valueVariant="wide"
										/>
									</div>
								),
							},
							{
								key: 'spans',
								label: 'Spans',
								children: (
									<div className={styles.tabsScroll}>
										<AnalyticsTabContent
											isLoading={isLoading}
											isError={isError}
											fieldName={colorByFieldName}
											rows={spanCountRows}
											valueVariant="narrow"
										/>
									</div>
								),
							},
						]}
					/>
				</div>
			</SheetContent>
		</Sheet>
	);
}

export default AnalyticsPanel;
