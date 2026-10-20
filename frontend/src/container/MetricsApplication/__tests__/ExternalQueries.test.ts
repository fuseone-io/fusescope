import { QueryBuilderData } from 'types/common/queryBuilder';

import {
	externalCallDurationByAddress,
	externalCallErrorPercent,
	externalCallRpsByAddress,
} from '../MetricsPageQueries/ExternalQueries';

const props = {
	servicename: 'frontend',
	legend: '{{address}}',
	tagFilterItems: [],
};

const byAddress: [string, QueryBuilderData][] = [
	['error percentage', externalCallErrorPercent(props)],
	['rps', externalCallRpsByAddress(props)],
	['duration', externalCallDurationByAddress(props)],
];

describe.each(byAddress)('external %s by address', (_, query) => {
	const addressFilters = query.queryData.map((data) =>
		data.filters?.items.find((item) => item.key?.key === 'address'),
	);

	it('excludes addresses with no usable host', () => {
		addressFilters.forEach((filter) => {
			expect(filter?.op).toBe('nregex');
			const excluded = new RegExp(String(filter?.value));
			['', ':', ':8080', '0.0.0.0', '0.0.0.0:', '0.0.0.0:8080', 'redis:'].forEach(
				(address) => expect(address).toMatch(excluded),
			);
			[
				'mysql',
				'1.2.3.4',
				'db.internal:5432',
				'driver.DriverService/FindNearest',
			].forEach((address) => expect(address).not.toMatch(excluded));
		});
	});
});
