import type {
	RumtypesClientBreakdownDTO,
	RumtypesReleaseMarkerDTO,
	RumtypesVitalSeriesDTO,
	RumtypesVitalSummaryDTO,
	RumtypesViewRouteDTO,
} from 'api/generated/services/fuseScope.schemas';
import { VitalSummary } from 'lib/rum/metricTypes';
import { VitalName } from 'lib/rum/types';
import { VITAL_THRESHOLDS } from 'lib/rum/vitals';

import {
	ClientShares,
	ReleaseMarker,
	ViewRow,
	ViewSort,
	ViewSortKey,
	VitalPoint,
} from './types';

export function toVitalSummary(
	dto: RumtypesVitalSummaryDTO | null | undefined,
): VitalSummary | undefined {
	if (!dto || dto.samples <= 0) {
		return undefined;
	}
	return {
		p75: dto.p75,
		samples: dto.samples,
		counts: {
			good: dto.good,
			needsImprovement: dto.needsImprovement,
			poor: dto.poor,
		},
	};
}

/** "GET /api/products/:id". */
export const requestLabel = ({
	method,
	path,
}: {
	method: string;
	path: string;
}): string => `${method} ${path}`;

export function toViewRows(
	routes: RumtypesViewRouteDTO[] | null | undefined,
): ViewRow[] {
	return (routes ?? []).map((route) => ({
		route: route.route,
		views: route.views,
		pageLoads: route.pageLoads,
		routeChanges: route.routeChanges,
		unknownLoads: route.unknownLoads,
		lcp: toVitalSummary(route.lcp),
		inp: toVitalSummary(route.inp),
		cls: toVitalSummary(route.cls),
		timeOnViewMs: route.medianTimeOnViewMs,
		errors: route.errors,
		slowest: route.slowestRequest
			? {
					label: requestLabel(route.slowestRequest),
					host: route.slowestRequest.host,
					p75Ms: route.slowestRequest.p75Ms,
				}
			: undefined,
	}));
}

const SORT_VALUES: Record<
	Exclude<ViewSortKey, 'route'>,
	(row: ViewRow) => number | undefined
> = {
	views: (row) => row.views,
	pageLoads: (row) => row.pageLoads,
	routeChanges: (row) => row.routeChanges,
	lcp: (row) => row.lcp?.p75,
	inp: (row) => row.inp?.p75,
	cls: (row) => row.cls?.p75,
	timeOnView: (row) => row.timeOnViewMs,
	errors: (row) => row.errors,
	slowest: (row) => row.slowest?.p75Ms,
};

/** Rows without the value go last either way; ties keep the busiest route first. */
export function sortViewRows(rows: ViewRow[], sort: ViewSort): ViewRow[] {
	const sign = sort.direction === 'asc' ? 1 : -1;
	return [...rows].sort((a, b) => {
		if (sort.key === 'route') {
			return sign * a.route.localeCompare(b.route);
		}
		const value = SORT_VALUES[sort.key];
		const [left, right] = [value(a), value(b)];
		if (left === undefined || right === undefined) {
			return Number(left === undefined) - Number(right === undefined);
		}
		return sign * (left - right) || b.views - a.views;
	});
}

export const unknownLoadsTotal = (rows: ViewRow[]): number =>
	rows.reduce((sum, row) => sum + row.unknownLoads, 0);

export function clientShares(
	rows: RumtypesClientBreakdownDTO[] | null | undefined,
): ClientShares {
	const list = rows ?? [];
	const pageLoads = list.reduce((sum, row) => sum + row.pageLoads, 0);
	const basis = pageLoads > 0 ? 'pageLoads' : 'views';
	const count = (row: RumtypesClientBreakdownDTO): number =>
		basis === 'pageLoads' ? row.pageLoads : row.views;
	const total = list.reduce((sum, row) => sum + count(row), 0);
	return {
		basis,
		rows: [...list]
			.sort((a, b) => count(b) - count(a))
			.map((row) => ({
				name: row.name,
				share: total > 0 ? Math.round((count(row) / total) * 100) : 0,
				lcpP75Ms: row.lcpP75Ms ?? undefined,
			})),
	};
}

export function vitalPoints(
	series: RumtypesVitalSeriesDTO | undefined,
	vital: VitalName,
): VitalPoint[] {
	const line = series?.vitals?.find((candidate) => candidate.name === vital);
	return (line?.points ?? [])
		.map((point) => ({ at: Date.parse(point.timestamp), p75: point.p75 }))
		.sort((a, b) => a.at - b.at);
}

export function releaseMarkers(
	releases: RumtypesReleaseMarkerDTO[] | null | undefined,
	start: number,
	end: number,
): ReleaseMarker[] {
	return (releases ?? [])
		.map((marker) => ({
			release: marker.release,
			at: Date.parse(marker.firstSeenAt),
		}))
		.filter((marker) => marker.at >= start && marker.at <= end);
}

export const rangeParams = (
	window: { start: number; end: number },
	release: string,
): { start: number; end: number; release?: string } => ({
	start: window.start,
	end: window.end,
	...(release ? { release } : {}),
});

/** The y-axis top: the poor threshold with headroom, or above the highest p75. */
export function chartMax(points: VitalPoint[], vital: VitalName): number {
	const poor = VITAL_THRESHOLDS[vital][1];
	const highest = Math.max(0, ...points.map((point) => point.p75));
	return Math.max(poor * 1.25, highest * 1.1);
}
