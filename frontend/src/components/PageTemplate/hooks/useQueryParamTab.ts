import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useSafeNavigate } from 'hooks/useSafeNavigate';

interface UseQueryParamTabOptions<Value extends string> {
	param: string;
	values: readonly Value[];
	fallback: Value;
}

function isOneOf<Value extends string>(
	values: readonly Value[],
	candidate: string | null,
): candidate is Value {
	return candidate !== null && (values as readonly string[]).includes(candidate);
}

/** The active tab kept in a query param of the current path. */
export function useQueryParamTab<Value extends string>({
	param,
	values,
	fallback,
}: UseQueryParamTabOptions<Value>): [Value, (value: string) => void] {
	const { pathname, search } = useLocation();
	const { safeNavigate } = useSafeNavigate();

	const current = new URLSearchParams(search).get(param);
	const value = isOneOf(values, current) ? current : fallback;

	const setValue = useCallback(
		(next: string): void => {
			const params = new URLSearchParams(search);
			params.set(param, next);
			safeNavigate(`${pathname}?${params.toString()}`);
		},
		[param, pathname, safeNavigate, search],
	);

	return [value, setValue];
}
