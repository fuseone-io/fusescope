import { ReactNode } from 'react';
import ExpandableValue from 'periscope/components/ExpandableValue';
import { SpanV3 } from 'types/api/trace/getTraceV3';

import styles from './SpanSummary.module.scss';
import { TraceIdField } from './TraceIdField';

interface HighlightedOption {
	key: string;
	label: string;
	render: (span: SpanV3) => ReactNode | null;
}

export const HIGHLIGHTED_OPTIONS: HighlightedOption[] = [
	{
		key: 'service',
		label: 'SERVICE',
		render: (span): ReactNode | null =>
			span['service.name'] ? (
				<span className={styles.monoValue}>
					<span className={styles.badgeEllipsisText} title={span['service.name']}>
						{span['service.name']}
					</span>
				</span>
			) : null,
	},
	{
		key: 'statusCode',
		label: 'STATUS CODE',
		render: (span): ReactNode | null =>
			span.status_code_string ? <span>{span.status_code_string}</span> : null,
	},
	{
		key: 'traceId',
		label: 'TRACE ID',
		render: (span): ReactNode | null =>
			span.trace_id ? <TraceIdField span={span} /> : null,
	},
	{
		key: 'spanKind',
		label: 'SPAN KIND',
		render: (span): ReactNode | null =>
			span.kind_string ? <span>{span.kind_string}</span> : null,
	},
	{
		key: 'statusMessage',
		label: 'STATUS MESSAGE',
		render: (span): ReactNode | null =>
			span.status_message ? (
				<ExpandableValue value={span.status_message} title="Status message">
					<span className={styles.monoValue}>
						<span className={styles.badgeEllipsisText}>{span.status_message}</span>
					</span>
				</ExpandableValue>
			) : null,
	},
];
