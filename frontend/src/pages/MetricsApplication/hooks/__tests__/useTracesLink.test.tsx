import { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryParams } from 'constants/query';
import { encode } from 'js-base64';
import history from 'lib/history';
import { AllTheProviders } from 'tests/test-utils';
import { Query } from 'types/api/queryBuilder/queryBuilderData';

import { SLOWEST_FIRST, useTracesLink } from '../useTracesLink';

const ENVIRONMENT = {
	id: 'env',
	tagKey: 'resource_deployment.environment',
	operator: 'IN',
	tagValue: ['prod'],
};

function Wrapper({ children }: { children: ReactNode }): JSX.Element {
	return (
		<AllTheProviders initialRoute="/services/frontend">
			{children}
		</AllTheProviders>
	);
}

function linkOf(url: string): { path: string; params: URLSearchParams } {
	const [path, search] = url.split('?');
	return { path, params: new URLSearchParams(search) };
}

describe('useTracesLink', () => {
	beforeEach(() => {
		history.push(
			`/services/frontend?${QueryParams.resourceAttributes}=${encode(
				JSON.stringify([ENVIRONMENT]),
			)}`,
		);
	});

	it('opens the slowest traces first in the list view, keeping the service and env filters', () => {
		const { result } = renderHook(() => useTracesLink('frontend'), {
			wrapper: Wrapper,
		});

		const { path, params } = linkOf(result.current([], SLOWEST_FIRST));
		const query = JSON.parse(
			params.get(QueryParams.compositeQuery) ?? '{}',
		) as Query;
		const [queryData] = query.builder.queryData;

		expect(path).toBe('/traces-explorer');
		expect(params.get(QueryParams.selectedExplorerView)).toBe('list');
		expect(queryData.orderBy).toStrictEqual([
			{ columnName: 'duration_nano', order: 'desc' },
		]);
		expect(
			queryData.filters?.items.map((item) => [item.key?.key, item.value]),
		).toStrictEqual(
			expect.arrayContaining([
				['serviceName', 'frontend'],
				['deployment.environment', ['prod']],
			]),
		);
		expect(params.get(QueryParams.startTime)).not.toBeNull();
		expect(params.get(QueryParams.endTime)).not.toBeNull();
	});

	it('keeps the explorer default order otherwise', () => {
		const { result } = renderHook(() => useTracesLink('frontend'), {
			wrapper: Wrapper,
		});

		const { params } = linkOf(result.current());
		const query = JSON.parse(
			params.get(QueryParams.compositeQuery) ?? '{}',
		) as Query;

		expect(params.get(QueryParams.selectedExplorerView)).toBeNull();
		expect(query.builder.queryData[0].orderBy).not.toStrictEqual([
			{ columnName: 'duration_nano', order: 'desc' },
		]);
	});
});
