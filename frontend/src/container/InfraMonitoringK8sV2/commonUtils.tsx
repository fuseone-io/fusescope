import type { StatusTone } from 'components/PageTemplate/types';
import {
	InframonitoringtypesPodCountsByStatusDTO,
	InframonitoringtypesPodStatusDTO,
} from 'api/generated/services/fuseScope.schemas';

import { StatusCountItem } from './components/GroupedStatusCounts';

/**
 * Converts size in bytes to a human-readable string with appropriate units
 */
export function formatBytes(bytes: number, decimals = 2): string {
	if (Number.isNaN(bytes) || !Number.isFinite(bytes)) {
		return '-';
	}

	if (bytes === 0) {
		return '0 Bytes';
	}

	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${parseFloat((bytes / k ** i).toFixed(decimals))} ${sizes[i]}`;
}

export const POD_STATUS_COLORS: Record<
	InframonitoringtypesPodStatusDTO,
	StatusTone
> = {
	[InframonitoringtypesPodStatusDTO.running]: 'success',
	[InframonitoringtypesPodStatusDTO.completed]: 'info',
	[InframonitoringtypesPodStatusDTO.pending]: 'warning',
	[InframonitoringtypesPodStatusDTO.unknown]: 'neutral',
	[InframonitoringtypesPodStatusDTO.no_data]: 'neutral',
	[InframonitoringtypesPodStatusDTO.failed]: 'error',
	[InframonitoringtypesPodStatusDTO.crashloopbackoff]: 'error',
	[InframonitoringtypesPodStatusDTO.imagepullbackoff]: 'error',
	[InframonitoringtypesPodStatusDTO.errimagepull]: 'error',
	[InframonitoringtypesPodStatusDTO.createcontainerconfigerror]: 'error',
	[InframonitoringtypesPodStatusDTO.containercreating]: 'warning',
	[InframonitoringtypesPodStatusDTO.oomkilled]: 'error',
	[InframonitoringtypesPodStatusDTO.error]: 'error',
	[InframonitoringtypesPodStatusDTO.containercannotrun]: 'error',
	[InframonitoringtypesPodStatusDTO.evicted]: 'error',
	[InframonitoringtypesPodStatusDTO.nodeaffinity]: 'error',
	[InframonitoringtypesPodStatusDTO.nodelost]: 'error',
	[InframonitoringtypesPodStatusDTO.shutdown]: 'error',
	[InframonitoringtypesPodStatusDTO.unexpectedadmissionerror]: 'error',
};

/** kubectl prints these as single CamelCase words, so the enum value alone is not a usable label. */
export const POD_STATUS_LABELS: Record<
	InframonitoringtypesPodStatusDTO,
	string
> = {
	[InframonitoringtypesPodStatusDTO.running]: 'Running',
	[InframonitoringtypesPodStatusDTO.completed]: 'Completed',
	[InframonitoringtypesPodStatusDTO.pending]: 'Pending',
	[InframonitoringtypesPodStatusDTO.unknown]: 'Unknown',
	[InframonitoringtypesPodStatusDTO.no_data]: 'No data',
	[InframonitoringtypesPodStatusDTO.failed]: 'Failed',
	[InframonitoringtypesPodStatusDTO.crashloopbackoff]: 'CrashLoopBackOff',
	[InframonitoringtypesPodStatusDTO.imagepullbackoff]: 'ImagePullBackOff',
	[InframonitoringtypesPodStatusDTO.errimagepull]: 'ErrImagePull',
	[InframonitoringtypesPodStatusDTO.createcontainerconfigerror]:
		'CreateContainerConfigError',
	[InframonitoringtypesPodStatusDTO.containercreating]: 'ContainerCreating',
	[InframonitoringtypesPodStatusDTO.oomkilled]: 'OOMKilled',
	[InframonitoringtypesPodStatusDTO.error]: 'Error',
	[InframonitoringtypesPodStatusDTO.containercannotrun]: 'ContainerCannotRun',
	[InframonitoringtypesPodStatusDTO.evicted]: 'Evicted',
	[InframonitoringtypesPodStatusDTO.nodeaffinity]: 'NodeAffinity',
	[InframonitoringtypesPodStatusDTO.nodelost]: 'NodeLost',
	[InframonitoringtypesPodStatusDTO.shutdown]: 'Shutdown',
	[InframonitoringtypesPodStatusDTO.unexpectedadmissionerror]:
		'UnexpectedAdmissionError',
};

type PodStatusCategory =
	| 'running'
	| 'completed'
	| 'pending'
	| 'unknown'
	| 'error';

const POD_STATUS_CATEGORY_MAP: Record<
	keyof InframonitoringtypesPodCountsByStatusDTO,
	PodStatusCategory
> = {
	running: 'running',
	completed: 'completed',
	pending: 'pending',
	unknown: 'unknown',
	failed: 'error',
	crashLoopBackOff: 'error',
	imagePullBackOff: 'error',
	errImagePull: 'error',
	createContainerConfigError: 'error',
	containerCreating: 'error',
	oomKilled: 'error',
	error: 'error',
	containerCannotRun: 'error',
	evicted: 'error',
	nodeAffinity: 'error',
	nodeLost: 'error',
	shutdown: 'error',
	unexpectedAdmissionError: 'error',
};

type ErrorStatusKey = {
	[K in keyof InframonitoringtypesPodCountsByStatusDTO]: (typeof POD_STATUS_CATEGORY_MAP)[K] extends 'error'
		? K
		: never;
}[keyof InframonitoringtypesPodCountsByStatusDTO];

const ERROR_STATUS_LABELS: Record<ErrorStatusKey, string> = {
	failed: 'Failed',
	crashLoopBackOff: 'CrashLoopBackOff',
	imagePullBackOff: 'ImagePullBackOff',
	errImagePull: 'ErrImagePull',
	createContainerConfigError: 'CreateContainerConfigError',
	containerCreating: 'ContainerCreating',
	oomKilled: 'OOMKilled',
	error: 'Error',
	containerCannotRun: 'ContainerCannotRun',
	evicted: 'Evicted',
	nodeAffinity: 'NodeAffinity',
	nodeLost: 'NodeLost',
	shutdown: 'Shutdown',
	unexpectedAdmissionError: 'UnexpectedAdmissionError',
};

const POD_STATUS_VALUES = new Set<string>(
	Object.values(InframonitoringtypesPodStatusDTO),
);

/**
 * The count DTO spells each status in camelCase (`crashLoopBackOff`) where the
 * status enum spells it lowercase (`crashloopbackoff`); anything that does not
 * land on a real enum member is dropped rather than sent to the API.
 */
function countKeyToPodStatus(
	key: string,
): InframonitoringtypesPodStatusDTO | null {
	const value = key.toLowerCase();
	return POD_STATUS_VALUES.has(value)
		? (value as InframonitoringtypesPodStatusDTO)
		: null;
}

export function getPodStatusItems(
	counts: InframonitoringtypesPodCountsByStatusDTO,
): StatusCountItem[] {
	const errorKeys = Object.keys(ERROR_STATUS_LABELS) as ErrorStatusKey[];

	const errorTotal = errorKeys.reduce((sum, key) => sum + counts[key], 0);
	const errorBreakdown = errorKeys.map((key) => ({
		label: ERROR_STATUS_LABELS[key],
		value: counts[key],
		statuses: [countKeyToPodStatus(key)].filter(
			(status): status is InframonitoringtypesPodStatusDTO => status !== null,
		),
	}));

	return [
		{
			value: counts.running,
			label: 'Running',
			color: 'var(--fs-success)',
			statuses: [InframonitoringtypesPodStatusDTO.running],
		},
		{
			value: counts.completed,
			label: 'Completed',
			color: 'var(--fs-primary)',
			statuses: [InframonitoringtypesPodStatusDTO.completed],
		},
		{
			value: counts.pending,
			label: 'Pending',
			color: 'var(--fs-warning)',
			statuses: [InframonitoringtypesPodStatusDTO.pending],
		},
		{
			value: counts.unknown,
			label: 'Unknown',
			color: 'var(--fs-subtle-foreground)',
			statuses: [InframonitoringtypesPodStatusDTO.unknown],
		},
		{
			value: errorTotal,
			label: 'Error Status',
			color: 'var(--fs-error)',
			breakdown: errorBreakdown,
			statuses: errorBreakdown.flatMap((item) => item.statuses),
		},
	];
}
