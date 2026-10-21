import { render, screen } from 'tests/test-utils';
import { ViewProps } from 'types/api/saveViews/types';

import ViewsTable from '../components/ViewsTable';

const view = (id: string, name: string): ViewProps =>
	({
		id,
		name,
		category: '',
		createdAt: '2026-10-18T09:12:00Z',
		createdBy: 'admin@fusescope.local',
		updatedAt: '2026-10-18T09:12:00Z',
		updatedBy: 'admin@fusescope.local',
		sourcePage: 'meter',
		tags: [],
		compositeQuery: {},
		extraData: JSON.stringify({ color: '#0f5fb8' }),
	}) as unknown as ViewProps;

const props = {
	views: [view('1', 'Log volume by service'), view('2', 'Span size')],
	loading: false,
	canEdit: true,
	onEdit: jest.fn(),
	onOpen: jest.fn(),
	onDelete: jest.fn(),
};

describe('ViewsTable', () => {
	it('has no Query column by default', () => {
		render(<ViewsTable {...props} />);

		expect(screen.queryByRole('columnheader', { name: 'Query' })).toBeNull();
		expect(screen.queryAllByTestId('saved-view-query')).toHaveLength(0);
	});

	it('shows each view query when it is given a describer', () => {
		render(
			<ViewsTable
				{...props}
				describeQuery={(item): string => `query of ${item.name}`}
			/>,
		);

		expect(
			screen.getByRole('columnheader', { name: 'Query' }),
		).toBeInTheDocument();
		expect(
			screen.getAllByTestId('saved-view-query').map((cell) => cell.textContent),
		).toStrictEqual(['query of Log volume by service', 'query of Span size']);
	});
});
