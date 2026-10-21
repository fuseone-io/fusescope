import { renderHook } from '@testing-library/react';
import { Timezone } from 'components/CustomTimePicker/timezoneUtils';

import useTimezoneFormatter from '../useTimezoneFormatter';

const UTC: Timezone = {
	value: 'UTC',
	name: 'UTC',
	offset: 'UTC',
	searchIndex: 'UTC',
};

describe('useTimezoneFormatter', () => {
	it('formats the same timestamp in each format it is asked for', () => {
		const { result } = renderHook(() =>
			useTimezoneFormatter({ userTimezone: UTC }),
		);
		const format = result.current.formatTimezoneAdjustedTimestamp;
		const at = '2025-04-14T18:27:57.797Z';

		expect(format(at, 'DD/MM/YYYY HH:mm:ss')).toBe('14/04/2025 18:27:57');
		expect(format(at, 'DD MMM, HH:mm:ss')).toBe('14 Apr, 18:27:57');
	});
});
