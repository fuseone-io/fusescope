import { initialQueriesMap } from 'constants/queryBuilder';

import { apdexWidget } from '../Tabs/Overview/ApDex/apdexWidget';

describe('apdexWidget', () => {
	it('draws Apdex on a 0–1 axis with two decimals', () => {
		const widget = apdexWidget(initialQueriesMap.traces.builder);
		expect(widget).toMatchObject({
			softMin: 0,
			softMax: 1,
			decimalPrecision: 2,
			id: 'SERVICE_OVERVIEW_APDEX',
			title: 'Apdex',
		});
		expect(widget.query.builder).toBe(initialQueriesMap.traces.builder);
	});
});
