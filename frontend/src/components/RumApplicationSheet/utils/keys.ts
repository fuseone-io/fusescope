import type { RumtypesGettableApplicationKeyDTO } from 'api/generated/services/fuseScope.schemas';
import { RumtypesKeyStatusDTO } from 'api/generated/services/fuseScope.schemas';

export const KEY_PREFIX = 'rum_pub_';

/** "rum_pub_••••••••••••9fXa". */
export const maskedKey = (last4: string): string =>
	`${KEY_PREFIX}${'•'.repeat(12)}${last4}`;

/** "rum_pub_…9fXa": the snippet's placeholder for a key the server no longer shows. */
export const keyPlaceholder = (last4: string): string =>
	`${KEY_PREFIX}…${last4}`;

export const activeKey = (
	keys: RumtypesGettableApplicationKeyDTO[],
): RumtypesGettableApplicationKeyDTO | undefined =>
	keys.find((key) => key.status === RumtypesKeyStatusDTO.active);

export const isRotating = (
	keys: RumtypesGettableApplicationKeyDTO[],
): boolean => keys.some((key) => key.status === RumtypesKeyStatusDTO.expiring);

/** "in 23 h", "in 6 d", "in 40 min". */
export function expiresIn(expiresAt: string, now = Date.now()): string {
	const minutes = Math.max(
		0,
		Math.round((Date.parse(expiresAt) - now) / 60_000),
	);
	if (minutes < 60) {
		return `in ${minutes} min`;
	}
	const hours = Math.round(minutes / 60);
	return hours < 48 ? `in ${hours} h` : `in ${Math.round(hours / 24)} d`;
}
