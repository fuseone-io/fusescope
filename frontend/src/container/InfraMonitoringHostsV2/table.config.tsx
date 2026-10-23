import React from 'react';
import { Server } from 'lucide-react';
import {
	InframonitoringtypesHostRecordDTO,
	InframonitoringtypesHostStatusDTO,
} from 'api/generated/services/fuseScope.schemas';
import TanStackTable, { TableColumnDef } from 'components/TanStackTableView';
import { getGroupByEl } from 'container/InfraMonitoringK8sV2/Base/utils';
import {
	EntityProgressBar,
	EntityProgressThresholds,
	ExpandButtonWrapper,
	GroupedStatusCounts,
	ValidateColumnValueWrapper,
} from 'container/InfraMonitoringK8sV2/components';
import {
	INFRA_MONITORING_ATTR_KEYS,
	InfraMonitoringEntity,
} from 'container/InfraMonitoringK8sV2/constants';
import { useInfraMonitoringGroupBy } from 'container/InfraMonitoringK8sV2/hooks';
import ColumnHeader from 'container/InfraMonitoringK8sV2/Base/ColumnHeader';
import EntityGroupHeader from 'container/InfraMonitoringK8sV2/Base/EntityGroupHeader';

import { HostnameCell } from './utils';

import styles from './table.module.scss';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import type { StatusTone } from 'components/PageTemplate/types';

const COMPACT_BAR = 'tw:[&>span:first-child]:min-w-10';

const statusMap: Record<
	InframonitoringtypesHostStatusDTO,
	{
		label: string;
		tone: StatusTone;
	}
> = {
	[InframonitoringtypesHostStatusDTO.active]: {
		label: 'Active',
		tone: 'success',
	},
	[InframonitoringtypesHostStatusDTO.inactive]: {
		label: 'Inactive',
		tone: 'warning',
	},
	['']: {
		label: 'Unknown',
		tone: 'neutral',
	},
};

function hostRowSource(host: InframonitoringtypesHostRecordDTO): {
	meta: Record<string, string>;
} {
	return {
		meta: {
			...(host.meta ?? {}),
			[INFRA_MONITORING_ATTR_KEYS.HOST_NAME]: host.hostName ?? '',
		},
	};
}

export function getHostRowKey(host: InframonitoringtypesHostRecordDTO): string {
	return host.hostName || 'unknown';
}

export function getHostItemKey(
	host: InframonitoringtypesHostRecordDTO,
): string {
	return host.hostName ?? '';
}

function HostGroupCell({
	row,
}: {
	row: InframonitoringtypesHostRecordDTO;
}): JSX.Element {
	const [groupBy] = useInfraMonitoringGroupBy();
	const synthetic = hostRowSource(row);
	return getGroupByEl(synthetic, groupBy) as JSX.Element;
}

export type HostColumnConfigType =
	TableColumnDef<InframonitoringtypesHostRecordDTO>;
export const hostColumnsConfig: HostColumnConfigType[] = [
	{
		id: 'hostGroup',
		header: (): React.ReactNode => <EntityGroupHeader title="Host Group" />,
		accessorFn: (row): string => row.hostName ?? '',
		width: { min: 170 },
		enableSort: false,
		enableRemove: false,
		enableMove: false,
		pin: 'left',
		visibilityBehavior: 'hidden-on-collapse',
		cell: ({ row, isExpanded, toggleExpanded }): React.ReactNode => (
			<ExpandButtonWrapper isExpanded={isExpanded} toggleExpanded={toggleExpanded}>
				<HostGroupCell row={row} />
			</ExpandButtonWrapper>
		),
	},
	{
		id: INFRA_MONITORING_ATTR_KEYS.HOST_NAME,
		header: (): React.ReactNode => (
			<EntityGroupHeader title="Hostname" icon={<Server size={14} />} />
		),
		accessorFn: (row): string => row.hostName ?? '',
		width: { min: 170 },
		enableSort: true,
		enableRemove: false,
		enableMove: false,
		pin: 'left',
		visibilityBehavior: 'hidden-on-expand',
		cell: ({ value }): React.ReactNode => (
			<HostnameCell hostName={value as string} />
		),
	},
	{
		id: 'status',
		header: (): React.ReactNode => (
			<ColumnHeader tooltip="Sent system metrics in last 10 mins.">
				Status
			</ColumnHeader>
		),
		accessorFn: (row): string => row.status,
		width: { min: 100 },
		enableSort: false,
		cell: ({ value, groupMeta, row, rowId }): React.ReactNode => {
			const status = value as InframonitoringtypesHostStatusDTO;

			if (groupMeta) {
				return (
					<GroupedStatusCounts
						rowId={rowId}
						items={[
							{
								value: row.activeHostCount,
								label: 'Active',
								color: 'var(--fs-success)',
							},
							{
								value: row.inactiveHostCount,
								label: 'Inactive',
								color: 'var(--fs-warning)',
							},
						]}
					/>
				);
			}

			const statusDetails = statusMap[status] || statusMap[''];
			return (
				<StatusBadge tone={statusDetails.tone} dot>
					{statusDetails.label}
				</StatusBadge>
			);
		},
	},
	{
		id: 'cpu',
		header: (): React.ReactNode => (
			<ColumnHeader tooltip={<EntityProgressThresholds type="cpu" />}>
				CPU
			</ColumnHeader>
		),
		accessorFn: (row): number => row.cpu,
		width: { min: 120 },
		enableSort: true,
		cell: ({ value, rowId }): React.ReactNode => {
			const cpu = value as number;
			return (
				<div className={styles.progressContainer}>
					<ValidateColumnValueWrapper
						value={cpu}
						entity={InfraMonitoringEntity.HOSTS}
						attribute="CPU metric"
						rowId={rowId}
					>
						<EntityProgressBar value={cpu} type="cpu" className={COMPACT_BAR} />
					</ValidateColumnValueWrapper>
				</div>
			);
		},
	},
	{
		id: 'memory',
		header: (): React.ReactNode => (
			<ColumnHeader
				tooltip={
					<EntityProgressThresholds
						type="memory"
						note="Working set size (WSS), excluding cache memory."
					/>
				}
			>
				Memory
			</ColumnHeader>
		),
		accessorFn: (row): number => row.memory,
		width: { min: 146 },
		enableSort: true,
		cell: ({ value, rowId }): React.ReactNode => {
			const memory = value as number;
			return (
				<div className={styles.progressContainer}>
					<ValidateColumnValueWrapper
						value={memory}
						entity={InfraMonitoringEntity.HOSTS}
						attribute="memory metric"
						rowId={rowId}
					>
						<EntityProgressBar value={memory} type="memory" className={COMPACT_BAR} />
					</ValidateColumnValueWrapper>
				</div>
			);
		},
	},
	{
		id: 'disk_usage',
		header: (): React.ReactNode => (
			<ColumnHeader tooltip={<EntityProgressThresholds type="disk" />}>
				Disk
			</ColumnHeader>
		),
		accessorFn: (row): number => row.diskUsage,
		width: { min: 120 },
		enableSort: true,
		cell: ({ value, rowId }): React.ReactNode => {
			const diskUsage = value as number;

			return (
				<div className={styles.progressContainer}>
					<ValidateColumnValueWrapper
						value={diskUsage}
						entity={InfraMonitoringEntity.HOSTS}
						attribute="disk usage metric"
						rowId={rowId}
					>
						<EntityProgressBar
							value={diskUsage}
							type="disk"
							className={COMPACT_BAR}
						/>
					</ValidateColumnValueWrapper>
				</div>
			);
		},
	},
	{
		id: 'wait',
		header: (): React.ReactNode => <ColumnHeader>IOWait</ColumnHeader>,
		accessorFn: (row): number => row.wait,
		width: { min: 108 },
		enableSort: true,
		cell: ({ value, rowId }): React.ReactNode => {
			const wait = value as number;

			return (
				<ValidateColumnValueWrapper
					value={wait}
					entity={InfraMonitoringEntity.HOSTS}
					attribute="IOWait metric"
					rowId={rowId}
				>
					<TanStackTable.Text>
						{`${Number((wait * 100).toFixed(1))}%`}
					</TanStackTable.Text>
				</ValidateColumnValueWrapper>
			);
		},
	},
	{
		id: 'load15',
		header: (): React.ReactNode => <ColumnHeader>Load (15m)</ColumnHeader>,
		accessorFn: (row): number => row.load15,
		width: { min: 96 },
		enableSort: true,
		cell: ({ value, rowId }): React.ReactNode => {
			const load15 = Number(value);

			return (
				<ValidateColumnValueWrapper
					value={load15}
					entity={InfraMonitoringEntity.HOSTS}
					attribute="load average metric"
					rowId={rowId}
				>
					<TanStackTable.Text>{load15.toFixed(2)}</TanStackTable.Text>
				</ValidateColumnValueWrapper>
			);
		},
	},
];
