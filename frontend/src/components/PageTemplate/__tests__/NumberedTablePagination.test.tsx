import { fireEvent, render, screen } from '@testing-library/react';

import NumberedTablePagination from '../components/NumberedTablePagination';
import { pageItems } from '../pagination';

describe('pageItems', () => {
	it('lists every page when there are few', () => {
		expect(pageItems(2, 5)).toStrictEqual([1, 2, 3, 4, 5]);
	});

	it('keeps the ends and the neighbours of the current page', () => {
		expect(pageItems(6, 12)).toStrictEqual([
			1,
			'gap-start',
			5,
			6,
			7,
			'gap-end',
			12,
		]);
		expect(pageItems(1, 12)).toStrictEqual([1, 2, 3, 'gap-end', 12]);
		expect(pageItems(12, 12)).toStrictEqual([1, 'gap-start', 10, 11, 12]);
	});
});

describe('NumberedTablePagination', () => {
	function renderPagination(
		page: number,
		onChange = jest.fn(),
	): { onChange: jest.Mock } {
		render(
			<NumberedTablePagination
				page={page}
				pageSize={100}
				total={540}
				onChange={onChange}
				itemLabel="exceptions"
			/>,
		);
		return { onChange };
	}

	it('shows the visible range and marks the current page', () => {
		renderPagination(2);

		expect(screen.getByText('Showing 101–200 of 540 exceptions')).toBeVisible();
		expect(screen.getByTestId('pagination-page-2')).toHaveAttribute(
			'aria-current',
			'page',
		);
		expect(screen.getByTestId('pagination-page-1')).not.toHaveAttribute(
			'aria-current',
		);
	});

	it('reports the page chosen by number or by next and previous', () => {
		const { onChange } = renderPagination(1);

		expect(screen.getByTestId('pagination-previous')).toBeDisabled();
		fireEvent.click(screen.getByTestId('pagination-page-3'));
		expect(onChange).toHaveBeenLastCalledWith(3, 100);
		fireEvent.click(screen.getByTestId('pagination-next'));
		expect(onChange).toHaveBeenLastCalledWith(2, 100);
	});

	it('disables next on the last page', () => {
		renderPagination(6);

		expect(screen.getByTestId('pagination-next')).toBeDisabled();
	});
});
