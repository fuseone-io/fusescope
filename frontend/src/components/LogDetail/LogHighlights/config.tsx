import { ReactNode } from 'react';
import { getLogIndicatorType } from 'components/Logs/LogStateIndicator/utils';
import SeverityBadge from 'components/Logs/SeverityBadge/SeverityBadge';
import { ILog } from 'types/api/logs/log';
import { normalizeSeverity } from 'utils/logSeverity';

import styles from './LogHighlights.module.scss';
import TraceIdField from './TraceIdField';

export interface LogHighlightConfig {
	key: string;
	label: string;
	render: (log: ILog) => ReactNode | null;
}

// Resource/attribute lookup (keys like `service.name` live in resources_string,
// occasionally attributes_string). Typed loosely as these are string maps.
const getAttr = (log: ILog, key: string): string =>
	(log.resources_string as unknown as Record<string, string>)?.[key] ||
	(log.attributes_string as unknown as Record<string, string>)?.[key] ||
	'';

const monoValue = (value: string, options?: { dot?: boolean }): ReactNode => (
	<span className={styles.monoValue}>
		{options?.dot && <span className={styles.serviceDot} />}
		<span className={styles.badgeText} title={value}>
			{value}
		</span>
	</span>
);

export const LOG_HIGHLIGHTS: LogHighlightConfig[] = [
	{
		key: 'service',
		label: 'SERVICE',
		render: (log): ReactNode | null => {
			const value = getAttr(log, 'service.name');
			return value ? monoValue(value, { dot: true }) : null;
		},
	},
	{
		key: 'severity',
		label: 'SEVERITY',
		render: (log): ReactNode | null => {
			if (!log.severity_text) {
				return null;
			}
			return (
				<span className="fs-ui tw:inline-flex">
					<SeverityBadge
						logType={getLogIndicatorType(log)}
						label={normalizeSeverity(log.severity_number, log.severity_text)}
					/>
				</span>
			);
		},
	},
	{
		key: 'namespace',
		label: 'NAMESPACE',
		render: (log): ReactNode | null => {
			const value = getAttr(log, 'service.namespace');
			return value ? monoValue(value) : null;
		},
	},
	{
		key: 'environment',
		label: 'ENVIRONMENT',
		render: (log): ReactNode | null => {
			const value = getAttr(log, 'deployment.environment');
			return value ? monoValue(value) : null;
		},
	},
	{
		key: 'traceId',
		label: 'TRACE ID',
		render: (log): ReactNode | null => {
			const traceId = log.trace_id || log.traceId;
			return traceId ? <TraceIdField traceId={traceId} /> : null;
		},
	},
	{
		key: 'spanId',
		label: 'SPAN ID',
		render: (log): ReactNode | null => {
			const spanId = log.span_id || log.spanID;
			return spanId ? monoValue(spanId) : null;
		},
	},
];
