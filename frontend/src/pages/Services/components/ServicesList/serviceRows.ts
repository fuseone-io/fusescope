import { serviceBadges } from 'lib/apm/highlights';
import { ServiceApm } from 'lib/apm/servicesList';
import { NS_PER_MS } from 'lib/apm/spanMetrics';
import { ServiceBadge } from 'lib/apm/types';
import { ServicesList } from 'types/api/metrics/getService';

export interface ServiceRow {
	service: ServicesList;
	serviceName: string;
	/** In ms whatever the source. */
	p99: number;
	errorRate: number;
	callRate: number;
	numCalls: number;
	badges: ServiceBadge[];
	/** Sort weight: highlighted services first, then by error rate. */
	flag: number;
	apm?: ServiceApm;
}

const BADGE_WEIGHT = 1000;

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);

/** The list's rows: its own values, plus the period comparison when it has loaded. */
export function buildServiceRows(
	services: ServicesList[],
	stats: Record<string, ServiceApm>,
	isMetricData: boolean,
): ServiceRow[] {
	return services.map((service) => {
		const apm = stats[service.serviceName];
		const badges = apm ? serviceBadges(apm.current, apm.previous) : [];
		const errorRate = finite(service.errorRate);
		return {
			service,
			serviceName: service.serviceName,
			p99: finite(isMetricData ? service.p99 : service.p99 / NS_PER_MS),
			errorRate,
			callRate: finite(service.callRate),
			numCalls: service.numCalls || apm?.current.requests || 0,
			badges,
			flag: badges.length * BADGE_WEIGHT + errorRate,
			apm,
		};
	});
}

/** The default order: highlights, then error rate, then p99, all descending. */
export function compareFlagged(a: ServiceRow, b: ServiceRow): number {
	return b.flag - a.flag || b.p99 - a.p99;
}
