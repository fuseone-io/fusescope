import { generatePath, Link } from 'react-router-dom';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import TanStackTable from 'components/TanStackTableView';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import ROUTES from 'constants/routes';
import { useIsDarkMode } from 'hooks/useDarkMode';
import { cn } from 'lib/utils';
import { generateColorPair } from 'pages/TraceDetailsV3/utils/generateColorPair';
import { useTimezone } from 'providers/Timezone';

import {
	DURATION_FIELD_NAMES,
	HTTP_METHOD_FIELD_NAMES,
	MONO_FIELD_NAMES,
	RESPONSE_CODE_FIELD_NAMES,
	SERVICE_FIELD_NAMES,
	SPAN_STATUS_FIELD_NAMES,
	TIMESTAMP_FIELD_NAMES,
	TRACE_ID_FIELD_NAMES,
} from './constants';
import DurationCell from './DurationCell';
import { isErrorSpan, spanStatus, stringifyCellValue } from './utils';

import styles from './TracesTable.module.scss';

type FieldCellProps = {
	name: string;
	value: unknown;
	row: Record<string, unknown>;
	maxDurationNano?: number;
};

function FieldCell({
	name,
	value,
	row,
	maxDurationNano,
}: FieldCellProps): JSX.Element {
	const { formatTimezoneAdjustedTimestamp } = useTimezone();
	const isDarkMode = useIsDarkMode();

	if (TIMESTAMP_FIELD_NAMES.has(name)) {
		const ts = value as string | number;
		const formatted =
			typeof ts === 'string'
				? formatTimezoneAdjustedTimestamp(ts, DATE_TIME_FORMATS.ISO_DATETIME_MS)
				: formatTimezoneAdjustedTimestamp(
						ts / 1e6,
						DATE_TIME_FORMATS.ISO_DATETIME_MS,
					);
		const text = String(formatted);
		return (
			<TanStackTable.Text title={text} className={cn(styles.mono, styles.muted)}>
				{text}
			</TanStackTable.Text>
		);
	}

	if (value === '' || value == null) {
		return <TanStackTable.Text data-testid={name}>-</TanStackTable.Text>;
	}

	const text = stringifyCellValue(value);

	if (TRACE_ID_FIELD_NAMES.has(name)) {
		return (
			<Link
				to={generatePath(ROUTES.TRACE_DETAIL, { id: text })}
				data-testid="trace-id"
				className={styles.mono}
				onClick={(e): void => e.stopPropagation()}
			>
				{text}
			</Link>
		);
	}

	if (HTTP_METHOD_FIELD_NAMES.has(name)) {
		return (
			<StatusBadge tone="neutral" testId={name} className={styles.mono}>
				{text}
			</StatusBadge>
		);
	}

	if (RESPONSE_CODE_FIELD_NAMES.has(name)) {
		return (
			<TanStackTable.Text
				data-testid={name}
				className={cn(styles.mono, 'tw:tabular-nums')}
			>
				{text}
			</TanStackTable.Text>
		);
	}

	if (SPAN_STATUS_FIELD_NAMES.has(name)) {
		const { tone, label } = spanStatus(text);
		return (
			<StatusBadge tone={tone} testId={name} dot>
				{label}
			</StatusBadge>
		);
	}

	if (DURATION_FIELD_NAMES.has(name)) {
		return (
			<DurationCell
				name={name}
				durationNano={Number(value)}
				maxDurationNano={maxDurationNano}
				isError={isErrorSpan(row)}
			/>
		);
	}

	if (SERVICE_FIELD_NAMES.has(name)) {
		return (
			<span className="fs-ui tw:flex tw:min-w-0 tw:items-center tw:gap-1.5">
				<span
					aria-hidden="true"
					data-testid="service-dot"
					className="tw:size-1.5 tw:flex-none tw:rounded-full"
					style={{
						backgroundColor: isDarkMode
							? generateColorPair(text).color
							: generateColorPair(text).colorDark,
					}}
				/>
				<TanStackTable.Text data-testid={name} title={text} className={styles.mono}>
					{text}
				</TanStackTable.Text>
			</span>
		);
	}

	return (
		<TanStackTable.Text
			data-testid={name}
			title={text}
			className={MONO_FIELD_NAMES.has(name) ? styles.mono : undefined}
		>
			{text}
		</TanStackTable.Text>
	);
}

FieldCell.defaultProps = {
	maxDurationNano: undefined,
};

export default FieldCell;
