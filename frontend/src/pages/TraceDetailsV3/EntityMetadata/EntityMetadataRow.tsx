import cx from 'classnames';
import { getYAxisFormattedValue } from 'components/Graph/yAxisConfig';
import HttpStatusCodeBadge from 'components/PageTemplate/components/HttpStatusCodeBadge';
import { useIsDarkMode } from 'hooks/useDarkMode';

import { generateColorPair } from '../utils/generateColorPair';
import EntityMetadataItem from './EntityMetadataItem';

import styles from './EntityMetadataRow.module.scss';

interface EntityMetadataRowProps {
	entity: 'trace' | 'span';
	className?: string;
	service?: { name: string; entryPoint?: string };
	durationMs?: number;
	execTimePercent?: number;
	spanCount?: number;
	timestamp?: string;
	statusCode?: string | number;
}

// Shared metadata row for the trace-details header and the span summary. Each
// node renders only when its data is provided; hovering shows a tooltip naming
// the value and keeps the default cursor. Interactive bits (e.g. linked spans)
// are intentionally kept out of here and rendered by the caller.
function EntityMetadataRow({
	entity,
	className,
	service,
	durationMs,
	execTimePercent,
	spanCount,
	timestamp,
	statusCode,
}: EntityMetadataRowProps): JSX.Element {
	const isDarkMode = useIsDarkMode();
	const isTrace = entity === 'trace';
	const entityLabel = isTrace ? 'Trace' : 'Span';
	const durationTooltip = isTrace ? 'Trace Duration' : 'Span Duration';
	// Single source of duration formatting so both rows label units identically.
	const duration =
		durationMs != null
			? getYAxisFormattedValue(`${durationMs}`, 'ms')
			: undefined;
	const serviceColor = service ? generateColorPair(service.name) : undefined;

	return (
		<div className={cx(styles.row, className)}>
			{service && (
				<EntityMetadataItem tooltip="Root service and entry-point span">
					<span
						aria-hidden="true"
						className={styles.dot}
						style={
							{
								'--service-dot-color': isDarkMode
									? serviceColor?.color
									: serviceColor?.colorDark,
							} as React.CSSProperties
						}
					/>
					<span className={styles.mono}>{service.name}</span>
					{service.entryPoint && (
						<>
							<span aria-hidden="true">→</span>
							<span className={styles.mono}>{service.entryPoint}</span>
						</>
					)}
				</EntityMetadataItem>
			)}

			{duration && (
				<EntityMetadataItem
					tooltip={durationTooltip}
					label={isTrace ? 'Duration' : undefined}
				>
					<span className={cx(styles.value, styles.strong)}>{duration}</span>
					{execTimePercent != null && (
						<span>
							{'— '}
							<strong className={styles.value}>{execTimePercent.toFixed(2)}%</strong>
							{' of total exec time'}
						</span>
					)}
				</EntityMetadataItem>
			)}

			{spanCount != null && (
				<EntityMetadataItem tooltip="Spans in this trace">
					<span>
						<span className={styles.value}>{spanCount}</span>
						{spanCount === 1 ? ' span' : ' spans'}
					</span>
				</EntityMetadataItem>
			)}

			{timestamp && (
				<EntityMetadataItem
					tooltip={`${entityLabel} start time`}
					label={isTrace ? 'Started' : undefined}
				>
					<span className={styles.value}>{timestamp}</span>
				</EntityMetadataItem>
			)}

			{statusCode && (
				<EntityMetadataItem tooltip="Root span status code" label="Status">
					<HttpStatusCodeBadge statusCode={statusCode} />
				</EntityMetadataItem>
			)}
		</div>
	);
}

EntityMetadataRow.defaultProps = {
	className: undefined,
	service: undefined,
	durationMs: undefined,
	execTimePercent: undefined,
	spanCount: undefined,
	timestamp: undefined,
	statusCode: undefined,
};

export default EntityMetadataRow;
