import { RumtypesKeyStatusDTO } from 'api/generated/services/fuseScope.schemas';

import {
	activeKey,
	expiresIn,
	isRotating,
	keyPlaceholder,
	maskedKey,
} from '../utils/keys';

const key = (id: string, status: RumtypesKeyStatusDTO) => ({
	id,
	applicationId: 'a',
	last4: id,
	status,
	createdAt: '2026-10-21T10:00:00Z',
	expiresAt: null,
	lastUsedAt: null,
});

describe('keys', () => {
	it('masks and abbreviates the key', () => {
		expect(maskedKey('x4fa')).toBe('rum_pub_••••••••••••x4fa');
		expect(keyPlaceholder('x4fa')).toBe('rum_pub_…x4fa');
	});

	it('finds the active key and an ongoing rotation', () => {
		const keys = [
			key('old1', RumtypesKeyStatusDTO.expiring),
			key('new1', RumtypesKeyStatusDTO.active),
		];
		expect(activeKey(keys)?.id).toBe('new1');
		expect(isRotating(keys)).toBe(true);
		expect(isRotating([keys[1]])).toBe(false);
		expect(activeKey([])).toBeUndefined();
	});

	it.each([
		[40 * 60_000, 'in 40 min'],
		[23 * 3_600_000, 'in 23 h'],
		[7 * 86_400_000, 'in 7 d'],
	])('expires %d ms from now %s', (ms, text) => {
		const now = Date.parse('2026-10-21T10:00:00Z');
		expect(expiresIn(new Date(now + ms).toISOString(), now)).toBe(text);
	});
});
