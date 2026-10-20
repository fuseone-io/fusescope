import { renderHook } from '@testing-library/react';

import { formatLastRun, useLastRun } from '../useLastRun';

describe('useLastRun', () => {
	it('is empty until a run finishes, then gives its end time and duration', () => {
		const now = jest.spyOn(performance, 'now');
		now.mockReturnValue(1000);
		const { result, rerender } = renderHook(
			({ fetching }) => useLastRun(fetching),
			{ initialProps: { fetching: false } },
		);
		expect(result.current).toBeNull();

		rerender({ fetching: true });
		expect(result.current).toBeNull();

		now.mockReturnValue(1412);
		rerender({ fetching: false });
		expect(result.current?.durationMs).toBe(412);
		expect(result.current?.finishedAt).toBeInstanceOf(Date);
		now.mockRestore();
	});
});

describe('formatLastRun', () => {
	it('reads the time and the duration', () => {
		expect(
			formatLastRun({
				finishedAt: new Date(2026, 9, 20, 14, 30, 2),
				durationMs: 412.4,
			}),
		).toBe('Last run 14:30:02 · 412 ms');
	});
});
