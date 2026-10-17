import { fireEvent, render, screen } from '@testing-library/react';
import { Table, TableHeader, TableRow } from 'components/ui/table';

import SortableTableHead from '../components/SortableTableHead';
import StatusBadge from '../components/StatusBadge';
import TablePagination from '../components/TablePagination';
import { compareRows, nextSort, pageOf } from '../utils';

describe('SortableTableHead', () => {
	function renderHead(active: boolean, onSort = jest.fn()): jest.Mock {
		render(
			<Table>
				<TableHeader>
					<TableRow>
						<SortableTableHead
							label="P99 latency"
							active={active}
							direction="desc"
							align="right"
							onSort={onSort}
							testId="sort-p99"
						/>
					</TableRow>
				</TableHeader>
			</Table>,
		);
		return onSort;
	}

	it('exposes the sort order of the active column', () => {
		renderHead(true);

		expect(screen.getByRole('columnheader')).toHaveAttribute(
			'aria-sort',
			'descending',
		);
	});

	it('leaves inactive columns unsorted and reports clicks', () => {
		const onSort = renderHead(false);

		expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'none');
		fireEvent.click(screen.getByTestId('sort-p99'));
		expect(onSort).toHaveBeenCalledTimes(1);
	});
});

describe('TablePagination', () => {
	it('shows the visible range and moves between pages', () => {
		const onPageChange = jest.fn();
		const { rerender } = render(
			<TablePagination
				page={1}
				pageSize={10}
				total={14}
				onPageChange={onPageChange}
			/>,
		);

		expect(screen.getByText('1-10 of 14 items')).toBeInTheDocument();
		expect(screen.getByTestId('pagination-previous')).toBeDisabled();
		fireEvent.click(screen.getByTestId('pagination-next'));
		expect(onPageChange).toHaveBeenCalledWith(2);

		rerender(
			<TablePagination
				page={2}
				pageSize={10}
				total={14}
				onPageChange={onPageChange}
			/>,
		);

		expect(screen.getByText('11-14 of 14 items')).toBeInTheDocument();
		expect(screen.getByTestId('pagination-next')).toBeDisabled();
	});

	it('renders nothing for a single page', () => {
		const { container } = render(
			<TablePagination
				page={1}
				pageSize={10}
				total={4}
				onPageChange={jest.fn()}
			/>,
		);

		expect(container).toBeEmptyDOMElement();
	});
});

describe('StatusBadge', () => {
	it('carries its tone', () => {
		render(<StatusBadge tone="error">8.70%</StatusBadge>);

		expect(screen.getByText('8.70%')).toHaveAttribute('data-tone', 'error');
	});
});

describe('table utils', () => {
	it('flips the direction of the active column and starts others at their default', () => {
		expect(nextSort({ key: 'p99', direction: 'desc' }, 'p99')).toStrictEqual({
			key: 'p99',
			direction: 'asc',
		});
		expect(
			nextSort({ key: 'p99', direction: 'asc' }, 'name', 'asc'),
		).toStrictEqual({
			key: 'name',
			direction: 'asc',
		});
		expect(nextSort({ key: 'p99', direction: 'asc' }, 'rate')).toStrictEqual({
			key: 'rate',
			direction: 'desc',
		});
	});

	it('compares numbers and strings in either direction', () => {
		const rows = [
			{ name: 'b', value: 2 },
			{ name: 'a', value: 3 },
			{ name: 'c', value: 1 },
		];

		expect(
			[...rows].sort(compareRows('value', 'desc')).map((row) => row.name),
		).toStrictEqual(['a', 'b', 'c']);
		expect(
			[...rows].sort(compareRows('name', 'asc')).map((row) => row.name),
		).toStrictEqual(['a', 'b', 'c']);
	});

	it('slices a page and clamps past the last one', () => {
		const items = Array.from({ length: 14 }, (_, index) => index);

		expect(pageOf(items, 2, 10)).toStrictEqual([10, 11, 12, 13]);
		expect(pageOf(items, 5, 10)).toStrictEqual([10, 11, 12, 13]);
	});
});
