import type { StatusTone } from 'components/PageTemplate/types';
import {
	InframonitoringtypesContainerCountsByReadyDTO,
	InframonitoringtypesContainerCountsByStatusDTO,
	InframonitoringtypesContainerReadyDTO,
	InframonitoringtypesContainerRecordDTO,
	InframonitoringtypesContainerStatusDTO,
} from 'api/generated/services/fuseScope.schemas';

import { StatusCountItem } from '../components/GroupedStatusCounts';
import { INFRA_MONITORING_ATTR_KEYS } from '../constants';

/** Renders as `name:tag`; the tag is dropped when the image is not pinned. */
export function getContainerImageWithTag(
	container: InframonitoringtypesContainerRecordDTO,
): string {
	const name = container.meta?.[INFRA_MONITORING_ATTR_KEYS.CONTAINER_IMAGE_NAME];
	const tag = container.meta?.[INFRA_MONITORING_ATTR_KEYS.CONTAINER_IMAGE_TAG];

	if (!name) {
		return '';
	}

	return tag ? `${name}:${tag}` : name;
}

export function getContainerName(
	container: InframonitoringtypesContainerRecordDTO,
): string {
	return (
		container.containerName ||
		container.meta?.[INFRA_MONITORING_ATTR_KEYS.K8S_CONTAINER_NAME] ||
		''
	);
}

export function getContainerPodUID(
	container: InframonitoringtypesContainerRecordDTO,
): string {
	return (
		container.podUID ||
		container.meta?.[INFRA_MONITORING_ATTR_KEYS.K8S_POD_UID] ||
		''
	);
}

export const CONTAINER_STATUS_COLORS: Record<
	InframonitoringtypesContainerStatusDTO,
	StatusTone
> = {
	[InframonitoringtypesContainerStatusDTO.running]: 'success',
	[InframonitoringtypesContainerStatusDTO.completed]: 'info',
	[InframonitoringtypesContainerStatusDTO.waiting]: 'warning',
	[InframonitoringtypesContainerStatusDTO.containercreating]: 'warning',
	[InframonitoringtypesContainerStatusDTO.terminated]: 'neutral',
	[InframonitoringtypesContainerStatusDTO.unknown]: 'neutral',
	[InframonitoringtypesContainerStatusDTO.no_data]: 'neutral',
	[InframonitoringtypesContainerStatusDTO.crashloopbackoff]: 'error',
	[InframonitoringtypesContainerStatusDTO.imagepullbackoff]: 'error',
	[InframonitoringtypesContainerStatusDTO.errimagepull]: 'error',
	[InframonitoringtypesContainerStatusDTO.createcontainerconfigerror]: 'error',
	[InframonitoringtypesContainerStatusDTO.oomkilled]: 'error',
	[InframonitoringtypesContainerStatusDTO.error]: 'error',
	[InframonitoringtypesContainerStatusDTO.containercannotrun]: 'error',
};

/** kubectl prints these as single CamelCase words, so the enum value alone is not a usable label. */
export const CONTAINER_STATUS_LABELS: Record<
	InframonitoringtypesContainerStatusDTO,
	string
> = {
	[InframonitoringtypesContainerStatusDTO.running]: 'Running',
	[InframonitoringtypesContainerStatusDTO.completed]: 'Completed',
	[InframonitoringtypesContainerStatusDTO.waiting]: 'Waiting',
	[InframonitoringtypesContainerStatusDTO.containercreating]:
		'ContainerCreating',
	[InframonitoringtypesContainerStatusDTO.terminated]: 'Terminated',
	[InframonitoringtypesContainerStatusDTO.unknown]: 'Unknown',
	[InframonitoringtypesContainerStatusDTO.no_data]: 'No data',
	[InframonitoringtypesContainerStatusDTO.crashloopbackoff]: 'CrashLoopBackOff',
	[InframonitoringtypesContainerStatusDTO.imagepullbackoff]: 'ImagePullBackOff',
	[InframonitoringtypesContainerStatusDTO.errimagepull]: 'ErrImagePull',
	[InframonitoringtypesContainerStatusDTO.createcontainerconfigerror]:
		'CreateContainerConfigError',
	[InframonitoringtypesContainerStatusDTO.oomkilled]: 'OOMKilled',
	[InframonitoringtypesContainerStatusDTO.error]: 'Error',
	[InframonitoringtypesContainerStatusDTO.containercannotrun]:
		'ContainerCannotRun',
};

const CONTAINER_ERROR_STATUS_LABELS: Partial<
	Record<keyof InframonitoringtypesContainerCountsByStatusDTO, string>
> = {
	crashLoopBackOff: 'CrashLoopBackOff',
	imagePullBackOff: 'ImagePullBackOff',
	errImagePull: 'ErrImagePull',
	createContainerConfigError: 'CreateContainerConfigError',
	oomKilled: 'OOMKilled',
	error: 'Error',
	containerCannotRun: 'ContainerCannotRun',
};

const CONTAINER_STATUS_VALUES = new Set<string>(
	Object.values(InframonitoringtypesContainerStatusDTO),
);

/** See countKeyToPodStatus in commonUtils — the counts DTO uses camelCase keys. */
function countKeyToContainerStatus(
	key: string,
): InframonitoringtypesContainerStatusDTO | null {
	const value = key.toLowerCase();
	return CONTAINER_STATUS_VALUES.has(value)
		? (value as InframonitoringtypesContainerStatusDTO)
		: null;
}

export function getContainerStatusItems(
	counts: InframonitoringtypesContainerCountsByStatusDTO,
): StatusCountItem[] {
	const errorKeys = Object.keys(CONTAINER_ERROR_STATUS_LABELS) as Array<
		keyof typeof CONTAINER_ERROR_STATUS_LABELS
	>;

	const errorBreakdown = errorKeys.map((key) => ({
		label: CONTAINER_ERROR_STATUS_LABELS[key] as string,
		value: counts[key],
		statuses: [countKeyToContainerStatus(key)].filter(
			(status): status is InframonitoringtypesContainerStatusDTO =>
				status !== null,
		),
	}));

	return [
		{
			value: counts.running,
			label: 'Running',
			color: 'var(--fs-success)',
			statuses: [InframonitoringtypesContainerStatusDTO.running],
		},
		{
			value: counts.completed,
			label: 'Completed',
			color: 'var(--fs-primary)',
			statuses: [InframonitoringtypesContainerStatusDTO.completed],
		},
		{
			value: counts.waiting + counts.containerCreating,
			label: 'Waiting',
			color: 'var(--fs-warning)',
			breakdown: [
				{
					label: 'Waiting',
					value: counts.waiting,
					statuses: [InframonitoringtypesContainerStatusDTO.waiting],
				},
				{
					label: 'ContainerCreating',
					value: counts.containerCreating,
					statuses: [InframonitoringtypesContainerStatusDTO.containercreating],
				},
			],
			statuses: [
				InframonitoringtypesContainerStatusDTO.waiting,
				InframonitoringtypesContainerStatusDTO.containercreating,
			],
		},
		{
			value: counts.terminated,
			label: 'Terminated',
			color: 'var(--fs-warning)',
			statuses: [InframonitoringtypesContainerStatusDTO.terminated],
		},
		{
			value: counts.unknown,
			label: 'Unknown',
			color: 'var(--fs-subtle-foreground)',
			statuses: [InframonitoringtypesContainerStatusDTO.unknown],
		},
		{
			value: errorKeys.reduce((sum, key) => sum + counts[key], 0),
			label: 'Error Status',
			color: 'var(--fs-error)',
			breakdown: errorBreakdown,
			statuses: errorBreakdown.flatMap((item) => item.statuses),
		},
	];
}

export const CONTAINER_READY_COLORS: Record<
	InframonitoringtypesContainerReadyDTO,
	StatusTone
> = {
	[InframonitoringtypesContainerReadyDTO.ready]: 'success',
	[InframonitoringtypesContainerReadyDTO.not_ready]: 'error',
	[InframonitoringtypesContainerReadyDTO.no_data]: 'neutral',
};

export const CONTAINER_READY_LABELS: Record<
	InframonitoringtypesContainerReadyDTO,
	string
> = {
	[InframonitoringtypesContainerReadyDTO.ready]: 'Ready',
	[InframonitoringtypesContainerReadyDTO.not_ready]: 'Not Ready',
	[InframonitoringtypesContainerReadyDTO.no_data]: 'No data',
};

export function getContainerReadyItems(
	counts: InframonitoringtypesContainerCountsByReadyDTO,
): StatusCountItem[] {
	return [
		{ value: counts.ready, label: 'Ready', color: 'var(--fs-success)' },
		{ value: counts.notReady, label: 'Not Ready', color: 'var(--fs-error)' },
	];
}
