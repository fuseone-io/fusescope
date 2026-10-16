import type { DashboardtypesQueryDTO } from 'api/generated/services/fuseScope.schemas';
import { toQueryEnvelopes } from 'pages/DashboardPage/DashboardContainer/queryV5/buildQueryRangeRequest';

/** Counts enabled queries, unwrapping the single `signoz/CompositeQuery` wrapper. */
export function countEnabledQueries(queries: DashboardtypesQueryDTO[]): number {
	return toQueryEnvelopes(queries).filter((envelope) => !envelope.spec?.disabled)
		.length;
}
