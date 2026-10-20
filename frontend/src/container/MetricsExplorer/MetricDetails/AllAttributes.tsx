import { useCallback, useMemo, useRef, useState } from 'react';
import { useCopyToClipboard } from 'react-use';
import logEvent from 'api/common/logEvent';
import { useGetMetricAttributes } from 'api/generated/services/metrics';
import { Button } from 'components/ui/button';
import { Check, Compass, Copy, Loader2, Search } from 'lucide-react';

import { PANEL_TYPES } from '../../../constants/queryBuilder';
import ROUTES from '../../../constants/routes';
import { useHandleExplorerTabChange } from '../../../hooks/useHandleExplorerTabChange';
import { MetricsExplorerEventKeys, MetricsExplorerEvents } from '../events';
import {
	AllAttributesEmptyText,
	AllAttributesValue,
} from './AllAttributesValue';
import { AllAttributesProps } from './types';
import { getMetricDetailsQuery } from './utils';

const COPY_FEEDBACK_DURATION_MS = 1500;

function AllAttributes({
	metricName,
	metricType,
	isMonotonic,
	temporality,
	minTime,
	maxTime,
}: AllAttributesProps): JSX.Element {
	const [searchString, setSearchString] = useState('');
	const [copiedKey, setCopiedKey] = useState<string | null>(null);
	const [, copyToClipboard] = useCopyToClipboard();
	const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();

	const {
		data: attributesData,
		isLoading: isLoadingAttributes,
		isError: isErrorAttributes,
		refetch: refetchAttributes,
	} = useGetMetricAttributes({
		metricName,
		start: minTime ? Math.floor(minTime / 1000000) : undefined,
		end: maxTime ? Math.floor(maxTime / 1000000) : undefined,
	});

	const attributes = useMemo(
		() =>
			[...(attributesData?.data.attributes ?? [])].sort(
				(a, b) => (b.valueCount ?? 0) - (a.valueCount ?? 0),
			),
		[attributesData],
	);

	const { handleExplorerTabChange } = useHandleExplorerTabChange();

	const goToMetricsExplorerwithAppliedSpaceAggregation = useCallback(
		(groupBy: string, valueCount?: number) => {
			const limit = valueCount && valueCount > 250 ? 100 : undefined;
			const compositeQuery = getMetricDetailsQuery(
				metricName,
				metricType,
				undefined,
				groupBy,
				limit,
				isMonotonic,
				temporality,
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
				[MetricsExplorerEventKeys.AttributeKey]: groupBy,
			});
		},
		[metricName, metricType, isMonotonic, temporality, handleExplorerTabChange],
	);

	const goToMetricsExploreWithAppliedAttribute = useCallback(
		(key: string, value: string) => {
			const compositeQuery = getMetricDetailsQuery(
				metricName,
				metricType,
				{ key, value },
				undefined,
				undefined,
				isMonotonic,
				temporality,
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
				[MetricsExplorerEventKeys.AttributeKey]: key,
				[MetricsExplorerEventKeys.AttributeValue]: value,
			});
		},
		[metricName, metricType, isMonotonic, temporality, handleExplorerTabChange],
	);

	const handleKeyMenuItemClick = useCallback(
		(menuKey: string, attributeKey: string, valueCount?: number): void => {
			switch (menuKey) {
				case 'open-in-explorer':
					goToMetricsExplorerwithAppliedSpaceAggregation(attributeKey, valueCount);
					break;
				case 'copy-key':
					copyToClipboard(attributeKey);
					setCopiedKey(attributeKey);
					clearTimeout(copyTimerRef.current);
					copyTimerRef.current = setTimeout(() => {
						setCopiedKey(null);
					}, COPY_FEEDBACK_DURATION_MS);
					break;
				default:
					break;
			}
		},
		[goToMetricsExplorerwithAppliedSpaceAggregation, copyToClipboard],
	);

	const filteredAttributes = useMemo(
		() =>
			attributes.filter(
				(attribute) =>
					attribute.key.toLowerCase().includes(searchString.toLowerCase()) ||
					attribute.values?.some((value) =>
						value.toLowerCase().includes(searchString.toLowerCase()),
					),
			),
		[attributes, searchString],
	);

	let content: JSX.Element;
	if (isLoadingAttributes) {
		content = (
			<div className="tw:flex tw:justify-center tw:py-6">
				<Loader2
					aria-label="Loading attributes"
					className="tw:size-4 tw:animate-spin tw:text-muted-foreground"
				/>
			</div>
		);
	} else if (!filteredAttributes.length) {
		content = (
			<div className="tw:px-4 tw:py-6 tw:text-center tw:text-[13px] tw:text-muted-foreground">
				<AllAttributesEmptyText
					isErrorAttributes={isErrorAttributes}
					refetchAttributes={refetchAttributes}
				/>
			</div>
		);
	} else {
		content = (
			<div className="all-attributes-content">
				{filteredAttributes.map((attribute) => (
					<div
						key={attribute.key}
						className="tw:flex tw:flex-col tw:gap-2 tw:border-b tw:border-border tw:px-4 tw:py-3 tw:last:border-b-0"
					>
						<div className="tw:flex tw:items-center tw:gap-2">
							<span
								className="tw:min-w-0 tw:flex-1 tw:truncate tw:font-mono tw:text-xs tw:font-medium"
								data-testid="metric-attribute-key"
							>
								{attribute.key}
							</span>
							<span className="tw:text-xs tw:whitespace-nowrap tw:text-subtle-foreground tw:tabular-nums">
								{`${attribute.valueCount} ${attribute.valueCount === 1 ? 'value' : 'values'}`}
							</span>
							<Button
								variant="ghost"
								size="icon-sm"
								className="tw:size-7 tw:text-muted-foreground"
								aria-label={`Open in Metric Explorer grouped by ${attribute.key}`}
								title="Open in Metric Explorer"
								onClick={(): void =>
									handleKeyMenuItemClick(
										'open-in-explorer',
										attribute.key,
										attribute.valueCount,
									)
								}
							>
								<Compass />
							</Button>
							<Button
								variant="ghost"
								size="icon-sm"
								className="tw:size-7 tw:text-muted-foreground"
								aria-label={
									copiedKey === attribute.key
										? `Copied key ${attribute.key}`
										: `Copy key ${attribute.key}`
								}
								title="Copy Key"
								onClick={(): void => handleKeyMenuItemClick('copy-key', attribute.key)}
							>
								{copiedKey === attribute.key ? <Check /> : <Copy />}
							</Button>
						</div>
						<AllAttributesValue
							filterKey={attribute.key}
							filterValue={attribute.values ?? []}
							goToMetricsExploreWithAppliedAttribute={
								goToMetricsExploreWithAppliedAttribute
							}
						/>
					</div>
				))}
			</div>
		);
	}

	return (
		<section
			aria-labelledby="metric-attributes-title"
			data-testid="all-attributes"
			className="metrics-accordion fs-ui tw:flex tw:flex-col tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:font-sans tw:text-foreground"
		>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-border tw:px-4 tw:py-3">
				<div className="tw:min-w-0">
					<h3
						id="metric-attributes-title"
						className="tw:flex tw:items-center tw:gap-1.5 tw:text-sm tw:font-semibold"
					>
						All attributes
						{!isLoadingAttributes && !isErrorAttributes && (
							<span className="tw:inline-flex tw:h-[18px] tw:items-center tw:rounded-sm tw:bg-muted tw:px-1.5 tw:text-xs tw:font-medium tw:text-muted-foreground tw:tabular-nums">
								{attributes.length}
							</span>
						)}
					</h3>
					<p className="tw:mt-0.5 tw:text-xs tw:text-muted-foreground">
						Keys and values seen in the selected time range, most values first
					</p>
				</div>
				<label className="tw:flex tw:h-8 tw:flex-[0_1_200px] tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-input tw:bg-surface-raised tw:px-2.5 tw:text-[13px] tw:has-[input:focus-visible]:border-ring">
					<Search
						aria-hidden="true"
						className="tw:size-3.5 tw:flex-none tw:text-subtle-foreground"
					/>
					<input
						className="tw:min-w-0 tw:flex-1 tw:border-0 tw:bg-transparent tw:text-foreground tw:outline-none tw:placeholder:text-subtle-foreground"
						placeholder="Search"
						aria-label="Search attributes"
						value={searchString}
						onChange={(e): void => {
							setSearchString(e.target.value);
						}}
						disabled={isLoadingAttributes || isErrorAttributes}
					/>
				</label>
			</div>
			{content}
		</section>
	);
}

export default AllAttributes;
