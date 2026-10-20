import { useGetApDexSettings } from 'hooks/apDex/useGetApDexSettings';

/** The service's Apdex T in seconds; 0.5 until its settings load. */
export const DEFAULT_APDEX_THRESHOLD = 0.5;

export function useApdexThreshold(servicename: string): number {
	const { data } = useGetApDexSettings(servicename);
	return data?.data?.[0]?.threshold ?? DEFAULT_APDEX_THRESHOLD;
}
