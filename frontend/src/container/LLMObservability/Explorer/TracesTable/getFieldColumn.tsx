import { TelemetryFieldKey } from 'api/v5/v5';
import type { TableColumnDef } from 'components/TanStackTableView/types';
import { buildCompositeKey } from 'container/OptionsMenu/utils';

import {
	fieldLabel,
	formatTokensInOut,
	OUTPUT_TOKENS_FIELD,
	TOKENS_IN_OUT_FIELD,
} from './columnFormat';
import { TIMESTAMP_FIELD_NAMES } from './constants';
import FieldCell from './FieldCell';

export type TracesTableRow = { id: string } & Record<string, unknown>;

export function getFieldColumn(
	field: TelemetryFieldKey,
): TableColumnDef<TracesTableRow> {
	const { name, fieldContext, fieldDataType } = field;
	const isTimestamp = TIMESTAMP_FIELD_NAMES.has(name);
	const isTokensInOut = name === TOKENS_IN_OUT_FIELD;

	return {
		id: buildCompositeKey(name, fieldContext, fieldDataType),
		header: fieldLabel(name),
		accessorFn: isTokensInOut
			? (row): unknown => formatTokensInOut(row[name], row[OUTPUT_TOKENS_FIELD])
			: (row): unknown => row[name],
		enableMove: !isTimestamp,
		enableRemove: !isTimestamp,
		canBeHidden: !isTimestamp,
		width: { min: isTokensInOut ? 144 : 192 },
		cell: ({ value }): JSX.Element => <FieldCell name={name} value={value} />,
	};
}
