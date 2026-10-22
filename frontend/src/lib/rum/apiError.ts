import { isAxiosError } from 'axios';

/** The server's message for a failed request, else a generic one. */
export function apiErrorMessage(error: unknown): string {
	if (isAxiosError(error)) {
		const data: unknown = error.response?.data;
		const message =
			data && typeof data === 'object' && 'error' in data
				? (data as { error?: { message?: unknown } }).error?.message
				: undefined;
		if (typeof message === 'string' && message) {
			return message;
		}
	}
	return 'Something went wrong. Try again.';
}
