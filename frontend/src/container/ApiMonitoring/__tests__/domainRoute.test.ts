import ROUTES from 'constants/routes';

import {
	DomainTab,
	domainPath,
	domainSearch,
	domainTabOfSearch,
	domainTabOfView,
	legacyDomainRedirect,
	readDomainParam,
} from '../domainRoute';
import { getApiMonitoringParams } from '../queryParams';

const legacySearch = (params: Record<string, unknown>, extra = ''): string =>
	`?apiMonitoringParams=${encodeURIComponent(JSON.stringify(params))}${extra}`;

const parse = (path: string): { pathname: string; search: URLSearchParams } => {
	const [pathname, search = ''] = path.split('?');
	return { pathname, search: new URLSearchParams(search) };
};

describe('domainPath', () => {
	it.each([
		['route:8083', '/api-monitoring/domains/route%3A8083'],
		['1.2.3.4', '/api-monitoring/domains/1.2.3.4'],
		['api.example.com/v1', '/api-monitoring/domains/api.example.com%2Fv1'],
	])('encodes %s into the route', (domain, expected) => {
		expect(domainPath(domain)).toBe(expected);
	});

	it('keeps the search it is given', () => {
		expect(domainPath('a.com', '?tab=endpoints')).toBe(
			'/api-monitoring/domains/a.com?tab=endpoints',
		);
	});

	it('matches the route template', () => {
		expect(ROUTES.API_MONITORING_DOMAIN).toBe('/api-monitoring/domains/:domain');
	});
});

describe('readDomainParam', () => {
	it.each([
		['route%3A8083', 'route:8083'],
		['1.2.3.4', '1.2.3.4'],
		['%E0%A4%A', '%E0%A4%A'],
	])('decodes %s', (raw, expected) => {
		expect(readDomainParam(raw)).toBe(expected);
	});
});

describe('domainTabOfView', () => {
	it.each([
		['endpoint_stats', DomainTab.Overview],
		['all_endpoints', DomainTab.Endpoints],
		['top_errors', DomainTab.Errors],
		[undefined, DomainTab.Overview],
		['unknown', DomainTab.Overview],
	])('maps the drawer view %s to a tab', (view, tab) => {
		expect(domainTabOfView(view)).toBe(tab);
	});
});

describe('legacyDomainRedirect', () => {
	it('returns null without a selected domain', () => {
		expect(legacyDomainRedirect('')).toBeNull();
		expect(legacyDomainRedirect(legacySearch({ showIP: false }))).toBeNull();
		expect(legacyDomainRedirect(legacySearch({ selectedDomain: '' }))).toBeNull();
	});

	it('moves a drawer link to the domain page and its tab', () => {
		const target = legacyDomainRedirect(
			legacySearch({ selectedDomain: 'route:8083', selectedView: 'top_errors' }),
		);
		const { pathname, search } = parse(target ?? '');

		expect(pathname).toBe('/api-monitoring/domains/route%3A8083');
		expect(domainTabOfSearch(`?${search.toString()}`)).toBe(DomainTab.Errors);
	});

	it('turns the drawer time range into the global one, in milliseconds', () => {
		const target = legacyDomainRedirect(
			legacySearch(
				{
					selectedDomain: 'api.example.com',
					selectedView: 'endpoint_stats',
					modalTimeRange: { startTime: 1700000000, endTime: 1700003600 },
					selectedInterval: 'custom',
				},
				'&relativeTime=15m',
			),
		);
		const { search } = parse(target ?? '');

		expect(search.get('startTime')).toBe('1700000000000');
		expect(search.get('endTime')).toBe('1700003600000');
		expect(search.get('relativeTime')).toBeNull();
	});

	it('keeps the endpoint, its filters and the other query params', () => {
		const filters = {
			op: 'AND',
			items: [
				{ id: 'a', key: { key: 'service.name' }, op: '=', value: 'payment' },
			],
		};
		const target = legacyDomainRedirect(
			legacySearch(
				{
					selectedDomain: 'api.example.com',
					selectedView: 'endpoint_stats',
					selectedEndPointName: '/charge',
					endPointDetailsLocalFilters: filters,
					showIP: false,
				},
				'&compositeQuery=abc',
			),
		);
		const { search } = parse(target ?? '');
		const params = getApiMonitoringParams(`?${search.toString()}`);

		expect(search.get('compositeQuery')).toBe('abc');
		expect(params).toStrictEqual({
			selectedView: 'endpoint_stats',
			selectedEndPointName: '/charge',
			endPointDetailsLocalFilters: filters,
			showIP: false,
		});
	});
});

describe('domainTabOfSearch', () => {
	it.each([
		['', DomainTab.Overview],
		['?compositeQuery=x', DomainTab.Overview],
		[legacySearch({ selectedView: 'all_endpoints' }), DomainTab.Endpoints],
		[legacySearch({ selectedView: 'top_errors' }), DomainTab.Errors],
		[legacySearch({ showIP: false }), DomainTab.Overview],
	])('reads %s', (search, tab) => {
		expect(domainTabOfSearch(search)).toBe(tab);
	});
});

describe('domainSearch', () => {
	it('keeps the list query and IP setting and opens the Overview', () => {
		const search = domainSearch(
			legacySearch(
				{
					showIP: false,
					selectedView: 'top_errors',
					selectedEndPointName: '/old',
					groupBy: ['http.method'],
				},
				'&compositeQuery=abc&relativeTime=1h',
			),
		);
		const params = new URLSearchParams(search);

		expect(params.get('compositeQuery')).toBe('abc');
		expect(params.get('relativeTime')).toBe('1h');
		expect(getApiMonitoringParams(search)).toStrictEqual({
			showIP: false,
			selectedView: 'endpoint_stats',
		});
		expect(domainTabOfSearch(search)).toBe(DomainTab.Overview);
	});
});
