import type { OnboardingtypesStatusDTO } from 'api/generated/services/fuseScope.schemas';
import ROUTES from 'constants/routes';

export function hasReceived(status: OnboardingtypesStatusDTO): boolean {
	return Boolean(
		status.traces?.received || status.metrics?.received || status.logs?.received,
	);
}

export function firstSeen(
	status: OnboardingtypesStatusDTO,
): number | undefined {
	const times = [
		status.traces?.firstSeen,
		status.metrics?.firstSeen,
		status.logs?.firstSeen,
	].filter((time): time is number => typeof time === 'number');
	return times.length > 0 ? Math.min(...times) : undefined;
}

export function serviceRoute(service: string): string {
	return ROUTES.SERVICE_METRICS.replace(
		':servicename',
		encodeURIComponent(service),
	);
}
