import { useMemo, useState } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useDispatch, useSelector } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import getLocalStorageApi from 'api/browser/localstorage/get';
import setLocalStorageApi from 'api/browser/localstorage/set';
import { FS_SERIES_DARK, FS_SERIES_LIGHT } from 'constants/fuseScopeColors';
import { LOCALSTORAGE } from 'constants/localStorage';
import { QueryParams } from 'constants/query';
import dayjs from 'dayjs';
import { useIsDarkMode } from 'hooks/useDarkMode';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { UpdateTimeInterval } from 'store/actions';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';

import { useTimeSeriesTimeManagement } from '../Explorer/useTimeSeriesTimeManagement';
import {
	getLogCountWidgetData,
	getLogSizeWidgetData,
	getMetricCountWidgetData,
	getSpanCountWidgetData,
	getSpanSizeWidgetData,
} from './graphs';
import MeterBillingNote from './MeterBillingNote';
import MeterChartPanel from './MeterChartPanel';
import MeterEmptyState from './MeterEmptyState';
import MeterNote from './MeterNote';
import MeterTotals from './MeterTotals';
import { useMeterBreakdown } from './useMeterBreakdown';

const WIDGETS = {
	logCount: getLogCountWidgetData(),
	logSize: getLogSizeWidgetData(),
	spanCount: getSpanCountWidgetData(),
	spanSize: getSpanSizeWidgetData(),
	datapoints: getMetricCountWidgetData(),
};

const ACCURATE_FROM = dayjs.utc('2025-08-22T00:00:00Z');
const ONE_HOUR_MS = 61 * 60 * 1000;

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}): JSX.Element {
	return (
		<section aria-label={title} className="tw:flex tw:flex-col tw:gap-4">
			<h2 className="fs-ui tw:flex tw:items-center tw:gap-2 tw:font-sans tw:text-xs tw:font-semibold tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase tw:after:h-px tw:after:flex-1 tw:after:bg-border">
				{title}
			</h2>
			<div className="tw:grid tw:grid-cols-1 tw:gap-4 tw:xl:grid-cols-2">
				{children}
			</div>
		</section>
	);
}

function BreakDown(): JSX.Element {
	const { isCloudUser } = useGetTenantLicense();
	const dispatch = useDispatch();
	const history = useHistory();
	const { pathname, search } = useLocation();
	const isDarkMode = useIsDarkMode();
	const { maxTime, minTime, selectedTime } = useSelector<
		AppState,
		GlobalReducer
	>((state) => state.globalTime);
	const { minTimeScale, maxTimeScale, onDragSelect } =
		useTimeSeriesTimeManagement({
			globalSelectedTime: selectedTime,
			maxTime,
			minTime,
		});

	const [showInfo, setShowInfo] = useState(
		() => getLocalStorageApi(LOCALSTORAGE.DISSMISSED_COST_METER_INFO) !== 'true',
	);
	const dismissInfo = (): void => {
		setShowInfo(false);
		setLocalStorageApi(LOCALSTORAGE.DISSMISSED_COST_METER_INFO, 'true');
	};

	const charts = useMeterBreakdown(useMemo(() => Object.values(WIDGETS), []));
	const [logCount, logSize, spanCount, spanSize, datapoints] = charts;
	const palette = isDarkMode ? FS_SERIES_DARK : FS_SERIES_LIGHT;

	const isLoading = charts.some((chart) => chart.isLoading);
	const hasData = charts.some((chart) => chart.summary.hasData);
	const showShortRangeWarning = (maxTime - minTime) / 1e6 < ONE_HOUR_MS;
	const isBeforeAccurateData = dayjs(minTime / 1e6).isBefore(ACCURATE_FROM);

	const showLastWeek = (): void => {
		const params = new URLSearchParams(search);
		params.delete(QueryParams.startTime);
		params.delete(QueryParams.endTime);
		params.set(QueryParams.relativeTime, '1w');
		history.push(`${pathname}?${params.toString()}`);
		dispatch(UpdateTimeInterval('1w'));
	};

	const panel = (
		title: string,
		chart: (typeof charts)[number],
		color: string,
	): JSX.Element => (
		<MeterChartPanel
			title={title}
			chart={chart}
			color={color}
			minTimeScale={minTimeScale}
			maxTimeScale={maxTimeScale}
			onDragSelect={onDragSelect}
		/>
	);

	return (
		<div
			data-testid="meter-breakdown"
			className="meter-explorer-breakdown tw:flex tw:flex-col tw:gap-4 tw:px-4 tw:pt-4 tw:pb-8 tw:md:px-6"
		>
			{showInfo && <MeterBillingNote onDismiss={dismissInfo} />}
			{isCloudUser && isBeforeAccurateData && (
				<MeterNote tone="warning">
					Meter data is accurate from Aug 22, 2025, 00:00 UTC. Earlier data was
					collected during the beta and may be inaccurate.
				</MeterNote>
			)}
			{showShortRangeWarning && (
				<MeterNote tone="warning">
					Meter data is aggregated per hour. Pick a range of at least one hour.
				</MeterNote>
			)}
			{!isLoading && !hasData ? (
				<MeterEmptyState onShowLastWeek={showLastWeek} />
			) : (
				<>
					<MeterTotals
						totals={[
							{ label: 'Log records ingested', chart: logSize },
							{ label: 'Spans ingested', chart: spanSize },
							{ label: 'Metric datapoints ingested', chart: datapoints },
						]}
					/>
					<Section title="Logs">
						{panel('Log records', logCount, palette.blue)}
						{panel('Log size', logSize, palette.blue)}
					</Section>
					<Section title="Traces">
						{panel('Spans', spanCount, palette.magenta)}
						{panel('Span size', spanSize, palette.magenta)}
					</Section>
					<Section title="Metrics">
						{panel('Metric datapoints', datapoints, palette.green)}
					</Section>
				</>
			)}
		</div>
	);
}

export default BreakDown;
