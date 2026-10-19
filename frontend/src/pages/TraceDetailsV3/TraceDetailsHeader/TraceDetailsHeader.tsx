import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@signozhq/ui/button';
import { Tooltip } from '@signozhq/ui/tooltip';
import cx from 'classnames';
import FieldsSelector from 'components/FieldsSelector';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { Button as UiButton } from 'components/ui/button';
import { Skeleton } from 'components/ui/skeleton';
import ROUTES from 'constants/routes';
import dayjs from 'dayjs';
import history, { hasInAppHistory } from 'lib/history';
import { ArrowLeft, ChartPie } from '@signozhq/icons';
import { TraceDetailV3URLProps } from 'types/api/trace/getTraceV3';
import { DataSource } from 'types/common/queryBuilder';

import { TraceDetailEventKeys, TraceDetailEvents } from '../events';
import { useTraceDetailLogEvent } from '../hooks/useTraceDetailLogEvent';
import { useTraceStore } from '../stores/traceStore';
import TraceDownloadPanel from './TraceDownloadPanel';
import EntityMetadataRow from '../EntityMetadata/EntityMetadataRow';
import AnalyticsPanel from '../SpanDetailsPanel/AnalyticsPanel/AnalyticsPanel';
import Filters from '../TraceWaterfall/TraceWaterfallStates/Success/Filters/Filters';
import MissingSpansBanner from './MissingSpansBanner';
import TraceOptionsMenu from './TraceOptionsMenu';
import { useTraceSummary } from './useTraceSummary';

import styles from './TraceDetailsHeader.module.scss';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';

interface TraceDetailsHeaderProps {
	onFilteredSpansChange: (spanIds: string[], isFilterActive: boolean) => void;
	showTraceDetailsHeaderOptions?: boolean;
}

const SKELETON_KEYS = ['service', 'duration', 'started'];

function DetailsLoader(): JSX.Element {
	return (
		<div className="fs-ui tw:flex tw:items-center tw:gap-4">
			{SKELETON_KEYS.map((key) => (
				<Skeleton key={key} className="tw:h-5 tw:w-40 tw:bg-muted" />
			))}
		</div>
	);
}

function TraceDetailsHeader({
	onFilteredSpansChange,
	showTraceDetailsHeaderOptions,
}: TraceDetailsHeaderProps): JSX.Element {
	const { id: traceID } = useParams<TraceDetailV3URLProps>();
	const [showTraceDetails, setShowTraceDetails] = useState(true);
	const [isFilterExpanded, setIsFilterExpanded] = useState(false);
	const [isPreviewFieldsOpen, setIsPreviewFieldsOpen] = useState(false);
	const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
	const { data: traceSummary, isError: isTraceSummaryError } =
		useTraceSummary(traceID);
	const previewFields = useTraceStore((s) => s.previewFields);
	const setPreviewFields = useTraceStore((s) => s.setPreviewFields);

	const logTraceEvent = useTraceDetailLogEvent('v3', traceID);

	const handleToggleAnalytics = useCallback((): void => {
		logTraceEvent(TraceDetailEvents.AnalyticsPanelToggled, {
			[TraceDetailEventKeys.Open]: !isAnalyticsOpen,
		});
		setIsAnalyticsOpen((prev) => !prev);
	}, [logTraceEvent, isAnalyticsOpen]);

	const handleAnalyticsTabChange = useCallback(
		(tab: string): void => {
			logTraceEvent(TraceDetailEvents.AnalyticsTabChanged, {
				[TraceDetailEventKeys.Tab]: tab,
			});
		},
		[logTraceEvent],
	);

	const handlePreviousBtnClick = useCallback((): void => {
		if (hasInAppHistory()) {
			history.goBack();
		} else {
			history.push(ROUTES.TRACES_EXPLORER);
		}
	}, []);

	const handleToggleTraceDetails = useCallback((): void => {
		setShowTraceDetails((prev) => !prev);
	}, []);

	const startTime = (traceSummary?.startTimestampMillis ?? 0) / 1e3;
	const endTime = (traceSummary?.endTimestampMillis ?? 0) / 1e3;

	const durationMs = traceSummary
		? traceSummary.endTimestampMillis - traceSummary.startTimestampMillis
		: 0;
	const errorCount = traceSummary?.totalErrorSpansCount ?? 0;

	return (
		<div className={styles.wrapper}>
			<div className={styles.header}>
				{!isFilterExpanded && (
					<div className={styles.traceIdSection}>
						<span className="fs-ui tw:inline-flex">
							<UiButton
								variant="outline"
								size="icon-sm"
								onClick={handlePreviousBtnClick}
								aria-label="Back"
							>
								<ArrowLeft size={16} />
							</UiButton>
						</span>
						<div className="fs-ui tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:gap-2.5 tw:font-sans tw:text-foreground">
							<span className="tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
								Trace
							</span>
							<h1
								data-testid="trace-details-trace-id"
								className="tw:min-w-0 tw:font-mono tw:text-lg tw:leading-snug tw:font-medium tw:break-all tw:tabular-nums"
							>
								{traceID}
							</h1>
							{errorCount > 0 && (
								<StatusBadge tone="error" dot testId="trace-details-error-count">
									{errorCount === 1 ? '1 error' : `${errorCount} errors`}
								</StatusBadge>
							)}
						</div>
					</div>
				)}
				{showTraceDetailsHeaderOptions && traceSummary && (
					<div
						className={cx(
							styles.filterSection,
							isFilterExpanded && styles.isExpanded,
						)}
					>
						{!isFilterExpanded && (
							<div className={styles.headerActions}>
								<Tooltip title="Analytics">
									<Button
										variant="ghost"
										size="sm"
										icon
										color="secondary"
										aria-label="Analytics"
										onClick={handleToggleAnalytics}
									>
										<ChartPie size={14} />
									</Button>
								</Tooltip>
								<TraceOptionsMenu
									showTraceDetails={showTraceDetails}
									onToggleTraceDetails={handleToggleTraceDetails}
									onOpenPreviewFields={(): void => setIsPreviewFieldsOpen(true)}
									traceId={traceID}
									startTime={startTime}
									endTime={endTime}
									totalSpansCount={traceSummary.totalSpansCount}
								/>
							</div>
						)}
						<div
							key="filter"
							className={cx(styles.filter, isFilterExpanded && styles.isExpanded)}
						>
							<Filters
								startTime={startTime}
								endTime={endTime}
								traceID={traceID}
								onFilteredSpansChange={onFilteredSpansChange}
								isExpanded={isFilterExpanded}
								onExpand={(): void => setIsFilterExpanded(true)}
								onCollapse={(): void => setIsFilterExpanded(false)}
							/>
						</div>
					</div>
				)}
			</div>

			{showTraceDetails && !isTraceSummaryError && (
				<div className={styles.subHeader}>
					{traceSummary ? (
						<EntityMetadataRow
							entity="trace"
							service={{
								name: traceSummary.rootServiceName,
								entryPoint: traceSummary.rootServiceEntryPoint,
							}}
							durationMs={durationMs}
							spanCount={traceSummary.totalSpansCount}
							timestamp={dayjs(traceSummary.startTimestampMillis).format(
								DATE_TIME_FORMATS.DD_MMM_YYYY_HH_MM_SS,
							)}
							statusCode={traceSummary.rootSpanStatusCode}
						/>
					) : (
						<DetailsLoader />
					)}
				</div>
			)}

			{traceSummary?.hasMissingSpans && <MissingSpansBanner />}

			<FieldsSelector
				isOpen={isPreviewFieldsOpen}
				title="Preview fields"
				fields={previewFields}
				onFieldsChange={setPreviewFields}
				onClose={(): void => setIsPreviewFieldsOpen(false)}
				signal={DataSource.TRACES}
				maxFields={10}
			/>

			<AnalyticsPanel
				isOpen={isAnalyticsOpen}
				onClose={(): void => setIsAnalyticsOpen(false)}
				onTabChange={handleAnalyticsTabChange}
			/>

			<TraceDownloadPanel />
		</div>
	);
}

export default TraceDetailsHeader;
