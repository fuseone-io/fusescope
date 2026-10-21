import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import logEvent from 'api/common/logEvent';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Widgets } from 'types/api/widgets/widget';

import MetricColumnGraphs from './MetricColumnGraphs';
import MetricPageGridGraph from './MetricPageGraph';
import {
	getCpuRecentUtilizationWidgetData,
	getCurrentOffsetPartitionWidgetData,
	getInsyncReplicasWidgetData,
	getJvmGcCollectionsElapsedWidgetData,
	getJvmGCCountWidgetData,
	getJvmMemoryHeapWidgetData,
	getOldestOffsetWidgetData,
	getPartitionCountPerTopicWidgetData,
} from './MetricPageUtil';

import './MetricPage.styles.scss';

interface CollapsibleMetricSectionProps {
	sectionKey: string;
	title: string;
	description: string;
	graphCount: Widgets[];
	isCollapsed: boolean;
	onToggle: () => void;
	checkIfDataExists?: (isDataAvailable: boolean) => void;
}

function CollapsibleMetricSection({
	sectionKey,
	title,
	description,
	graphCount,
	isCollapsed,
	onToggle,
	checkIfDataExists,
}: CollapsibleMetricSectionProps): JSX.Element {
	const contentId = `metric-section-${sectionKey}`;
	return (
		<ContentPanel
			testId={`metric-section-${sectionKey}`}
			className="metric-page-container"
			bodyClassName={isCollapsed ? 'tw:hidden' : 'metric-page-grid'}
			title={
				<button
					type="button"
					aria-expanded={!isCollapsed}
					aria-controls={contentId}
					onClick={onToggle}
					className="tw:-ml-1 tw:flex tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-md tw:border-0 tw:bg-transparent tw:px-1 tw:text-sm tw:font-semibold tw:text-foreground tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:outline-none"
				>
					{isCollapsed ? (
						<ChevronRight className="tw:size-4" aria-hidden />
					) : (
						<ChevronDown className="tw:size-4" aria-hidden />
					)}
					{title}
					<span className="tw:text-xs tw:font-normal tw:text-subtle-foreground">
						{graphCount.length} charts
					</span>
				</button>
			}
			subtitle={<span className="tw:pl-7">{description}</span>}
		>
			{!isCollapsed && (
				<div id={contentId} className="tw:contents">
					{graphCount.map((widgetData) => (
						<MetricPageGridGraph
							key={`graph-${widgetData.id}`}
							widgetData={widgetData}
							checkIfDataExists={checkIfDataExists}
						/>
					))}
				</div>
			)}
		</ContentPanel>
	);
}

CollapsibleMetricSection.defaultProps = {
	checkIfDataExists: undefined,
};

function MetricPage(): JSX.Element {
	const [collapsedSections, setCollapsedSections] = useState<{
		[key: string]: boolean;
	}>({
		producerMetrics: false,
		consumerMetrics: false,
	});

	const toggleCollapse = (key: string): void => {
		setCollapsedSections((prev) => ({
			...prev,
			[key]: !prev[key],
		}));
	};

	const { t } = useTranslation('messagingQueues');

	const metricSections = [
		{
			key: 'bokerJVMMetrics',
			title: t('metricGraphCategory.brokerJVMMetrics.title'),
			description: t('metricGraphCategory.brokerJVMMetrics.description'),
			graphCount: [
				getJvmGCCountWidgetData(),
				getJvmGcCollectionsElapsedWidgetData(),
				getCpuRecentUtilizationWidgetData(),
				getJvmMemoryHeapWidgetData(),
			],
		},
		{
			key: 'partitionMetrics',
			title: t('metricGraphCategory.partitionMetrics.title'),
			description: t('metricGraphCategory.partitionMetrics.description'),
			graphCount: [
				getPartitionCountPerTopicWidgetData(),
				getCurrentOffsetPartitionWidgetData(),
				getOldestOffsetWidgetData(),
				getInsyncReplicasWidgetData(),
			],
		},
	];

	const renderedGraphCountRef = useRef(0);
	const hasLoggedRef = useRef(false);

	const checkIfDataExists = useCallback((isDataAvailable: boolean): void => {
		if (isDataAvailable) {
			renderedGraphCountRef.current += 1;

			// Only log when first graph has rendered and we haven't logged yet
			if (renderedGraphCountRef.current === 1 && !hasLoggedRef.current) {
				void logEvent('MQ Kafka: Metric view', {
					graphRendered: true,
				});
				hasLoggedRef.current = true;
			}
		}
	}, []);

	return (
		<div className="metric-page">
			<MetricColumnGraphs checkIfDataExists={checkIfDataExists} />
			{metricSections.map(({ key, title, description, graphCount }) => (
				<CollapsibleMetricSection
					key={key}
					sectionKey={key}
					title={title}
					description={description}
					graphCount={graphCount}
					isCollapsed={collapsedSections[key]}
					onToggle={(): void => toggleCollapse(key)}
					checkIfDataExists={checkIfDataExists}
				/>
			))}
		</div>
	);
}

export default MetricPage;
