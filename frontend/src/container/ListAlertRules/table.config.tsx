import { STATE_LABELS } from 'components/Alerts/constants';
import LabelColumn from 'components/Alerts/LabelColumn';
import {
	alertTypeLabel,
	describeRuleCondition,
} from 'components/Alerts/ruleSummary';
import {
	SEVERITY_TONES,
	STATE_BADGE_CLASSES,
	STATE_TONES,
} from 'components/Alerts/tones';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import type { TableColumnDef } from 'components/TanStackTableView';
import TanStackTable from 'components/TanStackTableView';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';

import type { AlertRule } from './types';

export function getAlertRuleColumns(
	formatTimezoneAdjustedTimestamp: (date: string, format: string) => string,
): TableColumnDef<AlertRule>[] {
	return [
		{
			id: 'state',
			header: 'Status',
			accessorKey: 'state',
			width: { fixed: '130px' },
			enableSort: true,
			enableRemove: false,
			enableMove: false,
			cell: ({ row, value }): JSX.Element => {
				const state = String(value ?? '').toLowerCase();
				return (
					<StatusBadge
						dot
						tone={STATE_TONES[state] ?? 'neutral'}
						className={STATE_BADGE_CLASSES[state]}
						testId={`alert-row-${row.id ?? ''}-state`}
					>
						{STATE_LABELS[state] ?? 'Unknown'}
					</StatusBadge>
				);
			},
		},
		{
			id: 'name',
			header: 'Alert Name',
			accessorKey: 'alert',
			width: { default: '100%' },
			enableSort: true,
			enableRemove: false,
			enableMove: false,
			cell: ({ row, value }): JSX.Element => {
				const summary = [alertTypeLabel(row), describeRuleCondition(row)]
					.filter(Boolean)
					.join(' · ');
				return (
					<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5 tw:font-sans">
						<TanStackTable.Text
							title={value}
							data-testid={`alert-row-${row.id ?? ''}-name`}
							className="tw:font-medium"
						>
							{String(value ?? '—')}
						</TanStackTable.Text>
						{summary && (
							<span
								data-testid={`alert-row-${row.id ?? ''}-summary`}
								className="tw:truncate tw:text-xs tw:text-subtle-foreground"
							>
								{summary}
							</span>
						)}
					</div>
				);
			},
		},
		{
			id: 'severity',
			header: 'Severity',
			accessorFn: (row) => row.labels?.severity ?? '',
			width: { fixed: '120px' },
			enableSort: true,
			enableMove: false,
			cell: ({ row, value }): JSX.Element => {
				const severity = String(value ?? '').toLowerCase();
				if (!severity) {
					return (
						<TanStackTable.Text data-testid={`alert-row-${row.id ?? ''}-severity`}>
							—
						</TanStackTable.Text>
					);
				}
				return (
					<StatusBadge
						tone={SEVERITY_TONES[severity] ?? 'neutral'}
						testId={`alert-row-${row.id ?? ''}-severity`}
					>
						{severity}
					</StatusBadge>
				);
			},
		},
		{
			id: 'labels',
			header: 'Labels',
			accessorKey: 'labels',
			width: { default: '100%' },
			enableSort: false,
			enableMove: false,
			cell: ({ value }): JSX.Element => {
				const labels = value as Record<string, string> | undefined;
				if (!labels) {
					return <TanStackTable.Text>—</TanStackTable.Text>;
				}

				const tagKeys = Object.keys(labels).filter((k) => k !== 'severity');
				if (!tagKeys.length) {
					return <TanStackTable.Text>—</TanStackTable.Text>;
				}

				return <LabelColumn labels={tagKeys} value={labels} color="secondary" />;
			},
		},
		{
			id: 'createdAt',
			header: 'Created At',
			accessorKey: 'createdAt',
			width: { default: '100%' },
			enableSort: true,
			enableMove: false,
			defaultVisibility: false,
			cell: ({ value }): JSX.Element => (
				<TanStackTable.Text>
					{value
						? formatTimezoneAdjustedTimestamp(String(value), DATE_TIME_FORMATS.UTC_US)
						: '—'}
				</TanStackTable.Text>
			),
		},
		{
			id: 'createdBy',
			header: 'Created By',
			accessorKey: 'createdBy',
			width: { default: '100%' },
			enableSort: false,
			enableMove: false,
			defaultVisibility: false,
			cell: ({ value }): JSX.Element => (
				<TanStackTable.Text>{String(value ?? '—')}</TanStackTable.Text>
			),
		},
		{
			id: 'updatedAt',
			header: 'Updated At',
			accessorKey: 'updatedAt',
			width: { default: '100%' },
			enableSort: true,
			enableMove: false,
			defaultVisibility: false,
			cell: ({ value }): JSX.Element => (
				<TanStackTable.Text>
					{value
						? formatTimezoneAdjustedTimestamp(String(value), DATE_TIME_FORMATS.UTC_US)
						: '—'}
				</TanStackTable.Text>
			),
		},
		{
			id: 'updatedBy',
			header: 'Updated By',
			accessorKey: 'updatedBy',
			width: { default: '100%' },
			enableSort: false,
			enableMove: false,
			defaultVisibility: false,
			cell: ({ value }): JSX.Element => (
				<TanStackTable.Text>{String(value ?? '—')}</TanStackTable.Text>
			),
		},
	];
}
