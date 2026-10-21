import { InframonitoringtypesDeploymentRecordDTO } from 'api/generated/services/fuseScope.schemas';
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
import { Computer } from 'lucide-react';

export function getK8sDeploymentRowKey(
	deployment: InframonitoringtypesDeploymentRecordDTO,
): string {
	return (
		deployment.meta?.[INFRA_MONITORING_ATTR_KEYS.K8S_DEPLOYMENT_NAME] ||
		deployment.deploymentName ||
		''
	);
}

export function getK8sDeploymentItemKey(
	deployment: InframonitoringtypesDeploymentRecordDTO,
): SelectedItemParams {
	return {
		selectedItem:
			deployment.meta?.[INFRA_MONITORING_ATTR_KEYS.K8S_DEPLOYMENT_NAME] ?? null,
		clusterName:
			deployment.meta?.[INFRA_MONITORING_ATTR_KEYS.K8S_CLUSTER_NAME] ?? null,
		namespaceName:
			deployment.meta?.[INFRA_MONITORING_ATTR_KEYS.K8S_NAMESPACE_NAME] ?? null,
	};
}

export const k8sDeploymentsColumnsConfig: TableColumnDef<InframonitoringtypesDeploymentRecordDTO>[] =
	[
		{
			id: 'deploymentGroup',
			header: (): React.ReactNode => (
				<EntityGroupHeader title="Deployment Group" />
			),
			accessorFn: (row): string =>
				row.meta?.[INFRA_MONITORING_ATTR_KEYS.K8S_DEPLOYMENT_NAME] || '',
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
			id: INFRA_MONITORING_ATTR_KEYS.K8S_DEPLOYMENT_NAME,
			header: (): React.ReactNode => (
				<EntityGroupHeader
					title="Deployment Name"
					icon={<Computer data-hide-expanded="true" size={14} />}
				/>
			),
			accessorFn: (row): string =>
				row.meta?.[INFRA_MONITORING_ATTR_KEYS.K8S_DEPLOYMENT_NAME] || '',
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
				<TanStackTable.Text>{value as string}</TanStackTable.Text>
			),
		},
		{
			id: 'podCountsByStatus',
			header: (): React.ReactNode => <ColumnHeader>Pod Status</ColumnHeader>,
			accessorFn: (row): object | undefined => row.podCountsByStatus,
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
						rowId={rowId}
						items={getPodStatusItems(podCountsByStatus)}
					/>
				);
			},
		},
		{
			id: 'pod_replicas',
			header: (): React.ReactNode => <ColumnHeader>Pod Replicas</ColumnHeader>,
			accessorFn: (row): number => row.availablePods,
			width: { min: 180 },
			enableSort: false,
			enableResize: true,
			cell: ({ row, rowId }): React.ReactNode => (
				<GroupedStatusCounts
					rowId={rowId}
					items={[
						{
							value: row.availablePods,
							label: 'Available',
							color: 'var(--fs-success)',
						},
						{
							value: row.desiredPods,
							label: 'Desired',
							color: 'var(--fs-primary)',
						},
					]}
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
			accessorFn: (row): number => row.deploymentCPURequest,
			width: { min: 210 },
			enableSort: true,
			enableResize: true,
			defaultVisibility: false,
			cell: ({ value, rowId }): React.ReactNode => {
				const cpuRequest = value as number;
				return (
					<ValidateColumnValueWrapper
						rowId={rowId}
						value={cpuRequest}
						entity={InfraMonitoringEntity.DEPLOYMENTS}
						attribute="CPU Request"
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
			accessorFn: (row): number => row.deploymentCPULimit,
			width: { min: 210 },
			enableSort: true,
			enableResize: true,
			cell: ({ value, rowId }): React.ReactNode => {
				const cpuLimit = Number(value);
				return (
					<ValidateColumnValueWrapper
						rowId={rowId}
						value={cpuLimit}
						entity={InfraMonitoringEntity.DEPLOYMENTS}
						attribute="CPU Limit"
					>
						<EntityProgressBar value={cpuLimit} type="cpu-limit" />
					</ValidateColumnValueWrapper>
				);
			},
		},
		{
			id: 'cpu',
			header: (): React.ReactNode => (
				<ColumnHeader>CPU Usage (cores)</ColumnHeader>
			),
			accessorFn: (row): number => row.deploymentCPU,
			width: { min: 160 },
			enableSort: true,
			enableResize: true,
			cell: ({ value, rowId }): React.ReactNode => {
				const cpu = Number(value);
				return (
					<ValidateColumnValueWrapper
						rowId={rowId}
						value={cpu}
						entity={InfraMonitoringEntity.DEPLOYMENTS}
						attribute="CPU metric"
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
			accessorFn: (row): number => row.deploymentMemoryRequest,
			width: { min: 210 },
			enableSort: true,
			enableResize: true,
			defaultVisibility: false,
			cell: ({ value, rowId }): React.ReactNode => {
				const memoryRequest = Number(value);
				return (
					<ValidateColumnValueWrapper
						rowId={rowId}
						value={memoryRequest}
						entity={InfraMonitoringEntity.DEPLOYMENTS}
						attribute="Memory Request"
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
			accessorFn: (row): number => row.deploymentMemoryLimit,
			width: { min: 210 },
			enableSort: true,
			enableResize: true,
			cell: ({ value, rowId }): React.ReactNode => {
				const memoryLimit = Number(value);
				return (
					<ValidateColumnValueWrapper
						rowId={rowId}
						value={memoryLimit}
						entity={InfraMonitoringEntity.DEPLOYMENTS}
						attribute="Memory Limit"
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
			accessorFn: (row): number => row.deploymentMemory,
			width: { min: 180 },
			enableSort: true,
			enableResize: true,
			cell: ({ value, rowId }): React.ReactNode => {
				const memory = value as number;
				return (
					<ValidateColumnValueWrapper
						rowId={rowId}
						value={memory}
						entity={InfraMonitoringEntity.DEPLOYMENTS}
						attribute="memory metric"
					>
						<TanStackTable.Text>{formatBytes(memory)}</TanStackTable.Text>
					</ValidateColumnValueWrapper>
				);
			},
		},
		{
			id: 'available_pods',
			header: (): React.ReactNode => <ColumnHeader>Available Pods</ColumnHeader>,
			accessorFn: (row): number => row.availablePods,
			width: { min: 120 },
			enableSort: true,
			defaultVisibility: false,
			cell: ({ value, rowId }): React.ReactNode => {
				const availablePods = value as number;
				return (
					<ValidateColumnValueWrapper
						rowId={rowId}
						value={availablePods}
						entity={InfraMonitoringEntity.DEPLOYMENTS}
						attribute="available pod"
					>
						<TanStackTable.Text>{availablePods}</TanStackTable.Text>
					</ValidateColumnValueWrapper>
				);
			},
		},
		{
			id: 'desired_pods',
			header: (): React.ReactNode => <ColumnHeader>Desired Pods</ColumnHeader>,
			accessorFn: (row): number => row.desiredPods,
			width: { min: 120 },
			enableSort: true,
			defaultVisibility: false,
			cell: ({ value, rowId }): React.ReactNode => {
				const desiredPods = value as number;
				return (
					<ValidateColumnValueWrapper
						rowId={rowId}
						value={desiredPods}
						entity={InfraMonitoringEntity.DEPLOYMENTS}
						attribute="desired pod"
					>
						<TanStackTable.Text>{desiredPods}</TanStackTable.Text>
					</ValidateColumnValueWrapper>
				);
			},
		},
	];
