import getLocalStorage from 'api/browser/localstorage/get';
import {
	InframonitoringtypesChecksDTO,
	InframonitoringtypesCheckTypeDTO,
} from 'api/generated/services/fuseScope.schemas';
import { InfraMonitoringEntity } from '../../../constants';

export const ENTITY_TO_CHECK_TYPE: Record<
	InfraMonitoringEntity,
	InframonitoringtypesCheckTypeDTO
> = {
	[InfraMonitoringEntity.HOSTS]: InframonitoringtypesCheckTypeDTO.hosts,
	[InfraMonitoringEntity.PODS]: InframonitoringtypesCheckTypeDTO.pods,
	[InfraMonitoringEntity.NODES]: InframonitoringtypesCheckTypeDTO.nodes,
	[InfraMonitoringEntity.NAMESPACES]:
		InframonitoringtypesCheckTypeDTO.namespaces,
	[InfraMonitoringEntity.CLUSTERS]: InframonitoringtypesCheckTypeDTO.clusters,
	[InfraMonitoringEntity.DEPLOYMENTS]:
		InframonitoringtypesCheckTypeDTO.deployments,
	[InfraMonitoringEntity.STATEFULSETS]:
		InframonitoringtypesCheckTypeDTO.statefulsets,
	[InfraMonitoringEntity.DAEMONSETS]:
		InframonitoringtypesCheckTypeDTO.daemonsets,
	[InfraMonitoringEntity.JOBS]: InframonitoringtypesCheckTypeDTO.jobs,
	[InfraMonitoringEntity.VOLUMES]: InframonitoringtypesCheckTypeDTO.volumes,
	[InfraMonitoringEntity.CONTAINERS]:
		InframonitoringtypesCheckTypeDTO.kube_containers,
};

export interface CheckRow {
	kind: string;
	passed: boolean;
	typeLabel: string;
	items: string[] | null | undefined;
	componentName: string;
	documentationLink?: string;
}

/** Passed checks first, then the ones that need attention, as kubectl-style rows. */
export function toCheckRows(data: InframonitoringtypesChecksDTO): CheckRow[] {
	return [
		...(data.presentDefaultEnabledMetrics ?? []).map((entry) => ({
			kind: 'present-default',
			passed: true,
			typeLabel: 'Default enabled metrics',
			items: entry.metrics,
			componentName: entry.associatedComponent.name,
		})),
		...(data.presentOptionalMetrics ?? []).map((entry) => ({
			kind: 'present-optional',
			passed: true,
			typeLabel: 'Optional metrics',
			items: entry.metrics,
			componentName: entry.associatedComponent.name,
		})),
		...(data.presentRequiredAttributes ?? []).map((entry) => ({
			kind: 'present-attrs',
			passed: true,
			typeLabel: 'Required attributes',
			items: entry.attributes,
			componentName: entry.associatedComponent.name,
		})),
		...(data.missingDefaultEnabledMetrics ?? []).map((entry) => ({
			kind: 'missing-default',
			passed: false,
			typeLabel: 'Missing default metrics',
			items: entry.metrics,
			componentName: entry.associatedComponent.name,
			documentationLink: entry.documentationLink,
		})),
		...(data.missingOptionalMetrics ?? []).map((entry) => ({
			kind: 'missing-optional',
			passed: false,
			typeLabel: 'Missing optional metrics',
			items: entry.metrics,
			componentName: entry.associatedComponent.name,
			documentationLink: entry.documentationLink,
		})),
		...(data.missingRequiredAttributes ?? []).map((entry) => ({
			kind: 'missing-attrs',
			passed: false,
			typeLabel: 'Missing required attributes',
			items: entry.attributes,
			componentName: entry.associatedComponent.name,
			documentationLink: entry.documentationLink,
		})),
	];
}

export function countEntries(rows: CheckRow[]): {
	total: number;
	missing: number;
} {
	return {
		total: rows.length,
		missing: rows.filter((row) => !row.passed).length,
	};
}

const STORAGE_PREFIX = '@signozhq/k8s-instrumentation-checks-expanded';

export function getStorageKey(entity: InfraMonitoringEntity): string {
	return `${STORAGE_PREFIX}-${entity}`;
}

export function readExpandedState(entity: InfraMonitoringEntity): boolean {
	const stored = getLocalStorage(getStorageKey(entity));
	return stored === null ? true : stored === 'true';
}
