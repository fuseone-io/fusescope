import { renderHook } from '@testing-library/react';
import { useGetQueryRange } from 'hooks/queryBuilder/useGetQueryRange';

import useSampleLogs from '../useSampleLogs';

jest.mock('hooks/queryBuilder/useGetQueryRange', () => ({
	useGetQueryRange: jest.fn(),
}));

const response = {
	isFetching: false,
	isError: false,
	data: {
		payload: {
			data: {
				newResult: {
					data: {
						result: [
							{ list: [{ timestamp: '1', data: { id: 'a', body: 'order placed' } }] },
						],
					},
				},
			},
		},
	},
};

describe('useSampleLogs', () => {
	it('keeps the same logs across renders, so a simulation of them sticks', () => {
		(useGetQueryRange as jest.Mock).mockReturnValue(response);
		const { result, rerender } = renderHook(() =>
			useSampleLogs({
				filter: { items: [], op: 'AND' },
				timeInterval: '1h',
				count: 5,
			}),
		);
		const first = result.current.logs;

		rerender();

		expect(result.current.logs).toHaveLength(1);
		expect(result.current.logs).toBe(first);
	});
});
