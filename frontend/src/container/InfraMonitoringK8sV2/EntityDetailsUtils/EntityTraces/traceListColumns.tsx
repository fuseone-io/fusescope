import { TableColumnsType as ColumnsType } from 'antd';
import HttpStatusCodeBadge from 'components/PageTemplate/components/HttpStatusCodeBadge';
import TagChip from 'components/PageTemplate/components/TagChip';
import { TextNoData } from '../../components/TextNoData';
import { getMs } from 'utils/timeUtils';
import {
	BlockLink,
	getTraceLink,
} from 'container/TracesExplorer/ListView/utils';
import { RowData } from 'lib/query/createTableColumnsFromQuery';
import { BaseAutocompleteData } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { FormatTimezoneAdjustedTimestamp } from 'hooks/useTimezoneFormatter/useTimezoneFormatter';
import styles from './traceListColumns.module.scss';

const keyToLabelMap: Record<string, string> = {
	timestamp: 'Timestamp',
	serviceName: 'Service Name',
	name: 'Name',
	durationNano: 'Duration',
	httpMethod: 'HTTP Method',
	responseStatusCode: 'Status Code',
	spanID: 'Span ID',
	traceID: 'Trace ID',
};

const keyAliases: Record<string, string[]> = {
	serviceName: ['serviceName', 'service.name', 'service_name'],
	durationNano: ['durationNano', 'duration.nano', 'duration_nano'],
	httpMethod: ['httpMethod', 'http.method', 'http_method'],
	responseStatusCode: [
		'response_status_code',
		'response.status.code',
		'responseStatusCode',
	],
	spanID: ['spanID', 'span.id', 'span_id'],
	traceID: ['traceID', 'trace.id', 'trace_id'],
};

const getPrimaryKey = (key: string): string => {
	for (const [primaryKey, aliases] of Object.entries(keyAliases)) {
		if (aliases.includes(key)) {
			return primaryKey;
		}
	}
	return key;
};

const getValueForKey = (data: Record<string, any>, key: string): any => {
	const primaryKey = getPrimaryKey(key);
	const aliases = keyAliases[primaryKey];
	if (aliases) {
		for (const alias of aliases) {
			const aliasedValue = data[alias] || data.resource?.[alias];
			if (aliasedValue !== undefined) {
				return aliasedValue;
			}
		}
	}
	return data[key];
};

export const getTraceListColumns = (
	selectedColumns: BaseAutocompleteData[],
	formatTimezoneAdjustedTimestamp: FormatTimezoneAdjustedTimestamp,
): ColumnsType<RowData> => {
	const columns: ColumnsType<RowData> =
		selectedColumns.map(({ dataType, key, type }) => ({
			title: keyToLabelMap[getPrimaryKey(key)],
			dataIndex: key,
			key: `${key}-${dataType}-${type}`,
			width: 145,
			render: (value, item): JSX.Element => {
				const itemData = item.data as any;
				const primaryKey = getPrimaryKey(key);

				if (primaryKey === 'timestamp') {
					const date =
						typeof value === 'string'
							? formatTimezoneAdjustedTimestamp(value)
							: formatTimezoneAdjustedTimestamp(value / 1e6);

					return (
						<BlockLink to={getTraceLink(itemData)} openInNewTab>
							<span className={styles.cellText}>{date}</span>
						</BlockLink>
					);
				}

				if (value === '') {
					return (
						<BlockLink to={getTraceLink(itemData)} openInNewTab>
							<span data-testid={key} className={styles.cellText} data-novalue="true">
								-
							</span>
						</BlockLink>
					);
				}

				if (primaryKey === 'httpMethod') {
					const httpMethod = getValueForKey(itemData, key);

					if (!httpMethod) {
						return (
							<BlockLink to={getTraceLink(itemData)} openInNewTab>
								<span className={styles.cellText} data-novalue="true">
									-
								</span>
							</BlockLink>
						);
					}

					return (
						<BlockLink to={getTraceLink(itemData)} openInNewTab>
							<TagChip testId={key}>{httpMethod}</TagChip>
						</BlockLink>
					);
				}

				if (primaryKey === 'responseStatusCode') {
					const statusCode = getValueForKey(itemData, key);
					const numericCode = Number(statusCode);
					const isValidCode = !Number.isNaN(numericCode) && numericCode > 0;

					if (!isValidCode) {
						return (
							<BlockLink to={getTraceLink(itemData)} openInNewTab>
								{numericCode === 0 || !statusCode ? (
									<TextNoData type="typography" className={styles.cellText} />
								) : (
									<span className={styles.cellText}>{statusCode}</span>
								)}
							</BlockLink>
						);
					}

					return (
						<BlockLink to={getTraceLink(itemData)} openInNewTab>
							<HttpStatusCodeBadge statusCode={statusCode} testId={key} />
						</BlockLink>
					);
				}

				if (primaryKey === 'durationNano') {
					const durationNano = getValueForKey(itemData, key);

					return (
						<BlockLink to={getTraceLink(itemData)} openInNewTab>
							<span data-testid={key} className={styles.cellText}>
								{getMs(durationNano)}ms
							</span>
						</BlockLink>
					);
				}

				return (
					<BlockLink to={getTraceLink(itemData)} openInNewTab>
						<span data-testid={key} className={styles.cellText}>
							{getValueForKey(itemData, key)}
						</span>
					</BlockLink>
				);
			},
			responsive: ['md'],
		})) || [];

	return columns;
};
