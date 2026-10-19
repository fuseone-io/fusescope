import { Link2 } from '@signozhq/icons';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import dayjs from 'dayjs';
import { useIsDarkMode } from 'hooks/useDarkMode';
import { useTraceStore } from 'pages/TraceDetailsV3/stores/traceStore';
import { resolveSpanColor } from 'pages/TraceDetailsV3/utils';
import { SpanV3 } from 'types/api/trace/getTraceV3';

import EntityMetadataRow from '../EntityMetadata/EntityMetadataRow';
import { HIGHLIGHTED_OPTIONS } from './config';
import {
	LinkedSpansPanel,
	LinkedSpansToggle,
	useLinkedSpans,
} from './LinkedSpans/LinkedSpans';
import SpanPercentileBadge from './SpanPercentile/SpanPercentileBadge';
import SpanPercentilePanel from './SpanPercentile/SpanPercentilePanel';
import useSpanPercentile from './SpanPercentile/useSpanPercentile';

import styles from './SpanSummary.module.scss';

interface SpanSummaryProps {
	selectedSpan: SpanV3;
	traceStartTime?: number;
	traceEndTime?: number;
}

// Summary block shown above (narrow) / beside (wide) the tabs: span name +
// percentile, exec time / timestamp / linked spans, and the highlighted options.
function SpanSummary({
	selectedSpan,
	traceStartTime,
	traceEndTime,
}: SpanSummaryProps): JSX.Element {
	const percentile = useSpanPercentile(selectedSpan);
	const linkedSpans = useLinkedSpans((selectedSpan as any).references);
	const colorByFieldName = useTraceStore((s) => s.colorByField.name);
	const isDarkMode = useIsDarkMode();
	const { color, colorDark } = resolveSpanColor(selectedSpan, colorByFieldName);

	return (
		<div className={styles.summary}>
			<div className={styles.spanRow}>
				<span className={styles.spanTitle}>
					<span
						aria-hidden="true"
						className={styles.spanDot}
						style={{ background: isDarkMode ? color : colorDark }}
					/>
					<span className={styles.spanName} title={selectedSpan.name}>
						{selectedSpan.name}
					</span>
					{selectedSpan.has_error && (
						<span className="fs-ui tw:inline-flex">
							<StatusBadge tone="error" dot>
								Error
							</StatusBadge>
						</span>
					)}
				</span>
				<SpanPercentileBadge
					loading={percentile.loading}
					percentileValue={percentile.percentileValue}
					duration={percentile.duration}
					spanPercentileData={percentile.spanPercentileData}
					isOpen={percentile.isOpen}
					toggleOpen={percentile.toggleOpen}
				/>
			</div>

			<SpanPercentilePanel selectedSpan={selectedSpan} percentile={percentile} />

			<div className={styles.spanMetaGroup}>
				<EntityMetadataRow
					entity="span"
					durationMs={selectedSpan.duration_nano / 1000000}
					execTimePercent={
						traceStartTime && traceEndTime && traceEndTime > traceStartTime
							? (selectedSpan.duration_nano * 100) /
								((traceEndTime - traceStartTime) * 1e6)
							: undefined
					}
					timestamp={dayjs(selectedSpan.timestamp).format('HH:mm:ss — MMM D, YYYY')}
				/>

				<div className={styles.spanInfoItem}>
					<Link2 size={14} />
					<LinkedSpansToggle
						count={linkedSpans.count}
						isOpen={linkedSpans.isOpen}
						toggleOpen={linkedSpans.toggleOpen}
					/>
				</div>
			</div>

			<LinkedSpansPanel
				linkedSpans={linkedSpans.linkedSpans}
				isOpen={linkedSpans.isOpen}
			/>

			<dl className={styles.highlightedOptions}>
				{HIGHLIGHTED_OPTIONS.map((option) => {
					const rendered = option.render(selectedSpan);
					if (!rendered) {
						return null;
					}
					return (
						<div key={option.key} className={styles.option}>
							<dt className={styles.optionLabel}>{option.label}</dt>
							<dd className={styles.optionValue}>{rendered}</dd>
						</div>
					);
				})}
			</dl>
		</div>
	);
}

export default SpanSummary;
