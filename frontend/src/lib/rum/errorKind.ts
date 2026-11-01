import type { RumtypesErrorGroupDTO } from 'api/generated/services/fuseScope.schemas';

export type ErrorKind = 'crash' | 'anr' | 'native';

export const ANR_TYPE = 'ANR';

export const ERROR_KIND_LABELS: Record<ErrorKind, string> = {
	crash: 'Crash',
	anr: 'ANR',
	native: 'Native crash',
};

/** Android errors: an app crash or an Application Not Responding. */
export function errorKind(
	group: Pick<RumtypesErrorGroupDTO, 'source' | 'type'>,
): ErrorKind | undefined {
	if (group.source === 'native') {
		return 'native';
	}
	if (group.source === 'anr' || group.type === ANR_TYPE) {
		return 'anr';
	}
	if (group.source === 'crash') {
		return 'crash';
	}
	return undefined;
}
