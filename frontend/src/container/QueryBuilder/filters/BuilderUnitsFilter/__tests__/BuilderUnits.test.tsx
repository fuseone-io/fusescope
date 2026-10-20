import { render, screen } from '@testing-library/react';
import * as useQueryBuilderHooks from 'hooks/queryBuilder/useQueryBuilder';
import { QueryBuilderContextType } from 'types/common/queryBuilder';

import { BuilderUnitsFilter } from '../BuilderUnits';

function mockUnit(unit: string | undefined): void {
	jest.spyOn(useQueryBuilderHooks, 'useQueryBuilder').mockReturnValue({
		currentQuery: { unit },
		handleOnUnitsChange: jest.fn(),
	} as unknown as QueryBuilderContextType);
}

describe('BuilderUnitsFilter', () => {
	it('shows its placeholder when the query has an empty unit', () => {
		mockUnit('');
		render(<BuilderUnitsFilter onChange={jest.fn()} yAxisUnit="" />);

		expect(screen.getByText('Select unit')).toBeInTheDocument();
	});

	it('shows the selected unit', () => {
		mockUnit('ms');
		render(<BuilderUnitsFilter onChange={jest.fn()} />);

		expect(screen.queryByText('Select unit')).not.toBeInTheDocument();
	});
});
