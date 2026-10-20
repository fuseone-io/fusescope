import { useCallback, useEffect, useMemo, useState } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { useCopyToClipboard } from 'react-use';
import { ConfigProvider } from 'antd';
import logEvent from 'api/common/logEvent';
import { useGetMetricMetadata } from 'api/generated/services/metrics';
import { Button } from 'components/ui/button';
import { Sheet, SheetContent, SheetTitle } from 'components/ui/sheet';
import { Check, Compass, Copy, Crosshair, X } from 'lucide-react';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';

import { PANEL_TYPES } from '../../../constants/queryBuilder';
import ROUTES from '../../../constants/routes';
import { useHandleExplorerTabChange } from '../../../hooks/useHandleExplorerTabChange';
import { MetricsExplorerEventKeys, MetricsExplorerEvents } from '../events';
import { isInspectEnabled } from '../Inspect/utils';
import MetricTypeViewRenderer from '../Summary/MetricTypeViewRenderer';
import VolumeControlSection from '../VolumeControl/components/VolumeControlSection/VolumeControlSection';
import AllAttributes from './AllAttributes';
import DashboardsAndAlertsPopover from './DashboardsAndAlertsPopover';
import Highlights from './Highlights';
import Metadata from './Metadata';
import { MetricDetailsProps } from './types';
import { getMetricDetailsQuery } from './utils';

import './MetricDetails.styles.scss';
import '../Summary/Summary.styles.scss';

const PANEL_CLASS = 'metric-details-panel';
const COPY_FEEDBACK_DURATION_MS = 1500;

function getPopupContainer(trigger?: HTMLElement): HTMLElement {
	return trigger?.closest<HTMLElement>(`.${PANEL_CLASS}`) ?? document.body;
}

function MetricDetails({
	onClose,
	isOpen,
	metricName,
	openInspectModal,
}: MetricDetailsProps): JSX.Element {
	const { handleExplorerTabChange } = useHandleExplorerTabChange();
	const { maxTime, minTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);
	const [, copyToClipboard] = useCopyToClipboard();
	const [isNameCopied, setIsNameCopied] = useState(false);

	const {
		data: metricMetadataResponse,
		isLoading: isLoadingMetricMetadata,
		isError: isErrorMetricMetadata,
		refetch: refetchMetricMetadata,
	} = useGetMetricMetadata(
		{
			metricName,
		},
		{
			query: {
				enabled: !!metricName,
			},
		},
	);

	const metadata = useMemo(() => {
		if (!metricMetadataResponse) {
			return null;
		}
		const { type, description, unit, temporality, isMonotonic } =
			metricMetadataResponse.data;

		return {
			type,
			description,
			unit,
			temporality,
			isMonotonic,
		};
	}, [metricMetadataResponse]);

	const showInspectFeature = useMemo(
		() => isInspectEnabled(metadata?.type),
		[metadata?.type],
	);

	const goToMetricsExplorerwithSelectedMetric = useCallback(() => {
		if (metricName) {
			const compositeQuery = getMetricDetailsQuery(
				metricName,
				metadata?.type,
				undefined,
				undefined,
				undefined,
				metadata?.isMonotonic,
				metadata?.temporality,
			);
			handleExplorerTabChange(
				PANEL_TYPES.TIME_SERIES,
				{
					query: compositeQuery,
				},
				ROUTES.METRICS_EXPLORER_EXPLORER,
				true,
			);
			void logEvent(MetricsExplorerEvents.OpenInExplorerClicked, {
				[MetricsExplorerEventKeys.MetricName]: metricName,
				[MetricsExplorerEventKeys.Tab]: 'summary',
				[MetricsExplorerEventKeys.Modal]: 'metric-details',
			});
		}
	}, [
		metricName,
		handleExplorerTabChange,
		metadata?.type,
		metadata?.isMonotonic,
		metadata?.temporality,
	]);

	useEffect(() => {
		void logEvent(MetricsExplorerEvents.ModalOpened, {
			[MetricsExplorerEventKeys.Modal]: 'metric-details',
		});
	}, []);

	useEffect(() => {
		if (!isNameCopied) {
			return undefined;
		}
		const timer = setTimeout(
			() => setIsNameCopied(false),
			COPY_FEEDBACK_DURATION_MS,
		);
		return (): void => clearTimeout(timer);
	}, [isNameCopied]);

	const isActionButtonDisabled =
		!metricName || isLoadingMetricMetadata || isErrorMetricMetadata;

	const handleEscapeKeyDown = useCallback((event: KeyboardEvent): void => {
		const openPopover = document.querySelector(
			'.metric-details-popover:not(.ant-popover-hidden)',
		);
		if (openPopover) {
			event.preventDefault();
		}
	}, []);

	return (
		<Sheet
			open={isOpen}
			onOpenChange={(open): void => {
				if (!open) {
					onClose();
				}
			}}
		>
			<SheetContent
				side="right"
				showCloseButton={false}
				aria-describedby={undefined}
				onEscapeKeyDown={handleEscapeKeyDown}
				onOpenAutoFocus={(event): void => event.preventDefault()}
				data-testid="metric-details-panel"
				className={`${PANEL_CLASS} tw:w-[640px] tw:max-w-full tw:gap-0 tw:overscroll-contain tw:border-border tw:outline-none tw:bg-surface-raised tw:p-0 tw:font-sans tw:sm:max-w-full`}
			>
				<ConfigProvider getPopupContainer={getPopupContainer}>
					<div className="tw:flex tw:flex-none tw:flex-col tw:gap-3 tw:border-b tw:border-border tw:py-4 tw:pr-4 tw:pl-5">
						<div className="tw:flex tw:items-start tw:justify-between tw:gap-3">
							<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5">
								<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
									{metadata?.type && <MetricTypeViewRenderer type={metadata.type} />}
									<SheetTitle className="tw:font-mono tw:text-base tw:font-medium tw:break-all">
										{metricName}
									</SheetTitle>
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={isNameCopied ? 'Copied' : 'Copy metric name'}
										title="Copy metric name"
										className="tw:size-7 tw:text-muted-foreground"
										onClick={(): void => {
											copyToClipboard(metricName);
											setIsNameCopied(true);
										}}
									>
										{isNameCopied ? <Check /> : <Copy />}
									</Button>
								</div>
								{metadata?.description && (
									<p className="tw:text-[13px] tw:text-muted-foreground">
										{metadata.description}
									</p>
								)}
							</div>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Close metric details"
								className="tw:text-muted-foreground"
								onClick={onClose}
							>
								<X />
							</Button>
						</div>
						<div className="tw:flex tw:flex-wrap tw:gap-2">
							<Button
								size="sm"
								onClick={goToMetricsExplorerwithSelectedMetric}
								disabled={isActionButtonDisabled}
								data-testid="open-in-explorer-button"
							>
								<Compass />
								Open in Explorer
							</Button>
							{showInspectFeature && openInspectModal && (
								<Button
									variant="outline"
									size="sm"
									className="inspect-metrics-button"
									disabled={isActionButtonDisabled}
									onClick={(): void => {
										if (metricName) {
											openInspectModal(metricName);
										}
									}}
									data-testid="inspect-metric-button"
								>
									<Crosshair />
									Inspect
								</Button>
							)}
						</div>
					</div>
					<div className="metric-details-content tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-4 tw:overflow-y-auto tw:px-5 tw:pt-4 tw:pb-6 tw:[&>*]:flex-none">
						<Highlights metricName={metricName} />
						<DashboardsAndAlertsPopover metricName={metricName} />
						<Metadata
							metricName={metricName}
							metadata={metadata}
							isErrorMetricMetadata={isErrorMetricMetadata}
							isLoadingMetricMetadata={isLoadingMetricMetadata}
							refetchMetricMetadata={refetchMetricMetadata}
						/>
						<VolumeControlSection metricName={metricName} />
						<AllAttributes
							metricName={metricName}
							metricType={metadata?.type}
							isMonotonic={metadata?.isMonotonic}
							temporality={metadata?.temporality}
							minTime={minTime}
							maxTime={maxTime}
						/>
					</div>
				</ConfigProvider>
			</SheetContent>
		</Sheet>
	);
}

export default MetricDetails;
