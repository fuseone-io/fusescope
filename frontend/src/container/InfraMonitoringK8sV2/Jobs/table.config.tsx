import { InframonitoringtypesJobRecordDTO } from 'api/generated/services/fuseScope.schemas';
import TanStackTable, { TableColumnDef } from 'components/TanStackTableView';
import EntityNameCell from 'container/InfraMonitoringK8sV2/components/EntityNameCell';
import { ExpandButtonWrapper } from 'container/InfraMonitoringK8sV2/components';

import ColumnHeader from '../Base/ColumnHeader';
import ClickableStatusCounts from '../Base/components/StatusFilterCells/ClickableStatusCounts';
import EntityGroupHeader from '../Base/EntityGroupHeader';
import K8sGroupCell from '../Base/K8sGroupCell';
import { SelectedItemParams } from '../hooks';
import { formatBytes, getPodStatusItems } from '../commonUtils';
import {
	EntityProgressBar,
	EntityProgressThresholds,
	GroupedStatusCounts,
	TextNoData,
	ValidateColumnValueWrapper,
} from '../components';
import {
	INFRA_MONITORING_ATTR_KEYS,
	InfraMonitoringEntity,
} from '../constants';
import { Bolt } from 'lucide-react';

export function getK8sJobRowKey(job: InframonitoringtypesJobRecordDTO): string {
	return (
		job.meta?.[INFRA_MONITORING_ATTR_KEYS.K8S_JOB_NAME] || job.jobName || ''
	);
}

export function getK8sJobItemKey(
	job: InframonitoringtypesJobRecordDTO,
): SelectedItemParams {
	return {
		selectedItem: job.meta?.[INFRA_MONITORING_ATTR_KEYS.K8S_JOB_NAME] ?? null,
		clusterName: job.meta?.[INFRA_MONITORING_ATTR_KEYS.K8S_CLUSTER_NAME] ?? null,
		namespaceName:
			job.meta?.[INFRA_MONITORING_ATTR_KEYS.K8S_NAMESPACE_NAME] ?? null,
	};
}

export type JobTableColumnConfig =
	TableColumnDef<InframonitoringtypesJobRecordDTO>;
export const k8sJobsColumnsConfig: JobTableColumnConfig[] = [
	{
		id: 'jobGroup',
		header: (): React.ReactNode => <EntityGroupHeader title="Job Group" />,
		accessorFn: (row): string =>
			row.meta?.[INFRA_MONITORING_ATTR_KEYS.K8S_JOB_NAME] || '',
		width: { min: 290 },
		enableSort: false,
		enableRemove: false,
		enableMove: false,
		pin: 'left',
		visibilityBehavior: 'hidden-on-collapse',
		cell: ({ isExpanded, toggleExpanded, row }): JSX.Element | null => {
			return (
				<ExpandButtonWrapper
					isExpanded={isExpanded}
					toggleExpanded={toggleExpanded}
				>
					<K8sGroupCell row={row} />
				</ExpandButtonWrapper>
			);
		},
	},
	{
		id: INFRA_MONITORING_ATTR_KEYS.K8S_JOB_NAME,
		header: (): React.ReactNode => (
			<EntityGroupHeader
				title="Job Name"
				icon={<Bolt data-hide-expanded="true" size={14} />}
			/>
		),
		accessorFn: (row): string =>
			row.meta?.[INFRA_MONITORING_ATTR_KEYS.K8S_JOB_NAME] || '',
		width: { min: 290 },
		enableSort: true,
		enableRemove: false,
		enableMove: false,
		pin: 'left',
		visibilityBehavior: 'hidden-on-expand',
		cell: ({ value, row }): React.ReactNode => (
			<EntityNameCell
				name={String(value)}
				subtitle={row.meta?.[INFRA_MONITORING_ATTR_KEYS.K8S_NAMESPACE_NAME]}
			/>
		),
	},
	{
		id: 'namespaceName',
		header: (): React.ReactNode => <ColumnHeader>Namespace</ColumnHeader>,
		accessorFn: (row): string =>
			row.meta?.[INFRA_MONITORING_ATTR_KEYS.K8S_NAMESPACE_NAME] || '',
		width: { min: 160 },
		enableSort: false,
		enableResize: true,
		cell: ({ value }): React.ReactNode => (
			<TanStackTable.Text>{value}</TanStackTable.Text>
		),
	},
	{
		id: 'pod_counts_by_status',
		header: (): React.ReactNode => <ColumnHeader>Pod Status</ColumnHeader>,
		accessorFn: (row): InframonitoringtypesJobRecordDTO['podCountsByStatus'] =>
			row.podCountsByStatus,
		width: { min: 250 },
		enableSort: false,
		enableResize: true,
		cell: ({ row, rowId }): React.ReactNode => {
			const podCountsByStatus = row.podCountsByStatus;
			if (!podCountsByStatus) {
				return <TextNoData type="tanstack" />;
			}
			return (
				<ClickableStatusCounts
					kind="pod"
					items={getPodStatusItems(podCountsByStatus)}
					rowId={rowId}
				/>
			);
		},
	},
	{
		id: 'completion',
		header: (): React.ReactNode => <ColumnHeader>Completions</ColumnHeader>,
		accessorFn: (row): number => row.successfulPods,
		width: { min: 210 },
		enableSort: false,
		enableResize: true,
		cell: ({ row, rowId }): React.ReactNode => (
			<GroupedStatusCounts
				items={[
					{ value: row.activePods, label: 'Active', color: 'var(--fs-primary)' },
					{ value: row.failedPods, label: 'Failed', color: 'var(--fs-error)' },
					{
						value: row.successfulPods,
						label: 'Successful',
						color: 'var(--fs-success)',
					},
					{
						value: row.desiredSuccessfulPods,
						label: 'Desired',
						color: 'var(--fs-warning)',
					},
				]}
				rowId={rowId}
			/>
		),
	},
	{
		id: 'cpu_request',
		header: (): React.ReactNode => (
			<ColumnHeader tooltip={<EntityProgressThresholds type="cpu-request" />}>
				CPU Request Usage (%)
			</ColumnHeader>
		),
		accessorFn: (row): number => row.jobCPURequest,
		width: { min: 200, default: 200 },
		enableSort: true,
		enableResize: true,
		defaultVisibility: false,
		cell: ({ value, rowId }): React.ReactNode => {
			const cpuRequest = value as number;
			return (
				<ValidateColumnValueWrapper
					value={cpuRequest}
					entity={InfraMonitoringEntity.JOBS}
					attribute="CPU Request"
					rowId={rowId}
				>
					<EntityProgressBar value={cpuRequest} type="cpu-request" />
				</ValidateColumnValueWrapper>
			);
		},
	},
	{
		id: 'cpu_limit',
		header: (): React.ReactNode => (
			<ColumnHeader tooltip={<EntityProgressThresholds type="cpu-limit" />}>
				CPU Limit Usage (%)
			</ColumnHeader>
		),
		accessorFn: (row): number => row.jobCPULimit,
		width: { min: 200, default: 200 },
		enableSort: true,
		enableResize: true,
		cell: ({ value, rowId }): React.ReactNode => {
			const cpuLimit = value as number;
			return (
				<ValidateColumnValueWrapper
					value={cpuLimit}
					entity={InfraMonitoringEntity.JOBS}
					attribute="CPU Limit"
					rowId={rowId}
				>
					<EntityProgressBar value={cpuLimit} type="cpu-limit" />
				</ValidateColumnValueWrapper>
			);
		},
	},
	{
		id: 'cpu',
		header: (): React.ReactNode => <ColumnHeader>CPU Usage (cores)</ColumnHeader>,
		accessorFn: (row): number => row.jobCPU,
		width: { min: 160 },
		enableSort: true,
		enableResize: true,
		cell: ({ value, rowId }): React.ReactNode => {
			const cpu = Number(value);
			return (
				<ValidateColumnValueWrapper
					value={cpu}
					entity={InfraMonitoringEntity.JOBS}
					attribute="CPU metric"
					rowId={rowId}
				>
					<TanStackTable.Text>{cpu.toFixed(2)}</TanStackTable.Text>
				</ValidateColumnValueWrapper>
			);
		},
	},
	{
		id: 'memory_request',
		header: (): React.ReactNode => (
			<ColumnHeader tooltip={<EntityProgressThresholds type="memory-request" />}>
				Memory Request Usage (%)
			</ColumnHeader>
		),
		accessorFn: (row): number => row.jobMemoryRequest,
		width: { min: 190 },
		enableSort: true,
		enableResize: true,
		defaultVisibility: false,
		cell: ({ value, rowId }): React.ReactNode => {
			const memoryRequest = value as number;
			return (
				<ValidateColumnValueWrapper
					value={memoryRequest}
					entity={InfraMonitoringEntity.JOBS}
					attribute="Memory Request"
					rowId={rowId}
				>
					<EntityProgressBar value={memoryRequest} type="memory-request" />
				</ValidateColumnValueWrapper>
			);
		},
	},
	{
		id: 'memory_limit',
		header: (): React.ReactNode => (
			<ColumnHeader tooltip={<EntityProgressThresholds type="memory-limit" />}>
				Memory Limit Usage (%)
			</ColumnHeader>
		),
		accessorFn: (row): number => row.jobMemoryLimit,
		width: { min: 180 },
		enableSort: true,
		enableResize: true,
		cell: ({ value, rowId }): React.ReactNode => {
			const memoryLimit = value as number;
			return (
				<ValidateColumnValueWrapper
					value={memoryLimit}
					entity={InfraMonitoringEntity.JOBS}
					attribute="Memory Limit"
					rowId={rowId}
				>
					<EntityProgressBar value={memoryLimit} type="memory-limit" />
				</ValidateColumnValueWrapper>
			);
		},
	},
	{
		id: 'memory',
		header: (): React.ReactNode => (
			<ColumnHeader>Memory Usage (WSS)</ColumnHeader>
		),
		accessorFn: (row): number => row.jobMemory,
		width: { min: 160 },
		enableSort: true,
		enableResize: true,
		cell: ({ value, rowId }): React.ReactNode => {
			const memory = value as number;
			return (
				<ValidateColumnValueWrapper
					value={memory}
					entity={InfraMonitoringEntity.JOBS}
					attribute="memory metric"
					rowId={rowId}
				>
					<TanStackTable.Text>{formatBytes(memory)}</TanStackTable.Text>
				</ValidateColumnValueWrapper>
			);
		},
	},
	{
		id: 'active_pods',
		header: (): React.ReactNode => <ColumnHeader>Active Pods</ColumnHeader>,
		accessorFn: (row): number => row.activePods,
		width: { min: 100 },
		enableSort: true,
		defaultVisibility: false,
		cell: ({ value, rowId }): React.ReactNode => {
			const activePods = value as number;
			return (
				<ValidateColumnValueWrapper
					value={activePods}
					entity={InfraMonitoringEntity.JOBS}
					attribute="active pod"
					rowId={rowId}
				>
					<TanStackTable.Text>{activePods}</TanStackTable.Text>
				</ValidateColumnValueWrapper>
			);
		},
	},
	{
		id: 'failed_pods',
		header: (): React.ReactNode => <ColumnHeader>Failed Pods</ColumnHeader>,
		accessorFn: (row): number => row.failedPods,
		width: { min: 100 },
		enableSort: true,
		defaultVisibility: false,
		cell: ({ value, rowId }): React.ReactNode => {
			const failedPods = value as number;
			return (
				<ValidateColumnValueWrapper
					value={failedPods}
					entity={InfraMonitoringEntity.JOBS}
					attribute="failed pod"
					rowId={rowId}
				>
					<TanStackTable.Text>{failedPods}</TanStackTable.Text>
				</ValidateColumnValueWrapper>
			);
		},
	},
	{
		id: 'successful_pods',
		header: (): React.ReactNode => <ColumnHeader>Successful Pods</ColumnHeader>,
		accessorFn: (row): number => row.successfulPods,
		width: { min: 120 },
		enableSort: true,
		defaultVisibility: false,
		cell: ({ value, rowId }): React.ReactNode => {
			const successfulPods = value as number;
			return (
				<ValidateColumnValueWrapper
					value={successfulPods}
					entity={InfraMonitoringEntity.JOBS}
					attribute="successful pod"
					rowId={rowId}
				>
					<TanStackTable.Text>{successfulPods}</TanStackTable.Text>
				</ValidateColumnValueWrapper>
			);
		},
	},
	{
		id: 'desired_successful_pods',
		header: (): React.ReactNode => (
			<ColumnHeader>Desired Successful Pods</ColumnHeader>
		),
		accessorFn: (row): number => row.desiredSuccessfulPods,
		width: { min: 160 },
		enableSort: true,
		defaultVisibility: false,
		cell: ({ value, rowId }): React.ReactNode => {
			const desiredSuccessfulPods = value as number;
			return (
				<ValidateColumnValueWrapper
					value={desiredSuccessfulPods}
					entity={InfraMonitoringEntity.JOBS}
					attribute="desired successful pod"
					rowId={rowId}
				>
					<TanStackTable.Text>{desiredSuccessfulPods}</TanStackTable.Text>
				</ValidateColumnValueWrapper>
			);
		},
	},
];
