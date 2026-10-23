import { AxiosError, AxiosHeaders } from 'axios';

import { isNotFoundError } from '../apiError';

function axiosError(status: number): AxiosError {
	return new AxiosError('failed', 'ERR', undefined, undefined, {
		status,
		statusText: '',
		data: {},
		headers: {},
		config: { headers: new AxiosHeaders() },
	});
}

describe('isNotFoundError', () => {
	it.each([
		[axiosError(404), true],
		[axiosError(500), false],
		[new Error('x'), false],
	])('%s', (error, expected) => {
		expect(isNotFoundError(error)).toBe(expected);
	});
});
