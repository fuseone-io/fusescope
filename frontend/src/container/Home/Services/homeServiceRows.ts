import { ServiceApm } from 'lib/apm/servicesList';
import {
	buildServiceRows,
	compareFlagged,
	ServiceRow,
} from 'pages/Services/components/ServicesList/serviceRows';
import { ServicesList } from 'types/api/metrics/getService';

const HOME_SERVICES = 5;

/** The services Home lists: highlighted first, then by error rate. */
export function homeServiceRows(
	services: ServicesList[],
	stats: Record<string, ServiceApm>,
	isMetricData: boolean,
): ServiceRow[] {
	return buildServiceRows(services, stats, isMetricData)
		.sort(compareFlagged)
		.slice(0, HOME_SERVICES);
}
