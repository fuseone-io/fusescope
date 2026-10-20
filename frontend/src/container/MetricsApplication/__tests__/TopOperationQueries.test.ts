import { DataTypes } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { TagFilterItem } from 'types/api/queryBuilder/queryBuilderData';

import { topOperationQueries } from '../MetricsPageQueries/TopOperationQueries';

const env: TagFilterItem = {
	id: 'env',
	key: { key: 'deployment.environment', dataType: DataTypes.EMPTY, type: '' },
	op: 'IN',
	value: ['prod'],
};

describe('topOperationQueries', () => {
	it('applies the page filters to every key operations query', () => {
		const { queryData } = topOperationQueries({
			servicename: 'frontend',
			tagFilterItems: [env],
		});

		queryData.forEach((query) => {
			const keys = query.filters?.items.map((item) => item.key?.key);
			expect(keys).toContain('service.name');
			expect(keys).toContain('deployment.environment');
		});
	});
});
