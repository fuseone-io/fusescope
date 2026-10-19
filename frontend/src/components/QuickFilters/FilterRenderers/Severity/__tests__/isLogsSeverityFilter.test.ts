import { IQuickFiltersConfig, QuickFiltersSource } from '../../../types';
import { isLogsSeverityFilter } from '../isLogsSeverityFilter';

const facet = (key: string): IQuickFiltersConfig =>
	({ attributeKey: { key } }) as unknown as IQuickFiltersConfig;

describe('isLogsSeverityFilter', () => {
	it.each([
		[QuickFiltersSource.LOGS_EXPLORER, 'severity_text', true],
		[QuickFiltersSource.LOGS_EXPLORER, 'service.name', false],
		[QuickFiltersSource.TRACES_EXPLORER, 'severity_text', false],
	])('on %s, %s is levelled: %s', (source, key, expected) => {
		expect(isLogsSeverityFilter(source, facet(key))).toBe(expected);
	});
});
