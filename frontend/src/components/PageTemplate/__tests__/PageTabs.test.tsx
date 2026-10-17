import { fireEvent, render, screen } from '@testing-library/react';

import PageTabs from '../components/PageTabs';
import { PageTab } from '../types';

const tabs: PageTab[] = [
	{ value: 'overview', label: 'Overview', content: <p>overview body</p> },
	{
		value: 'db',
		label: 'DB Call Metrics',
		badge: <span>3</span>,
		content: <p>db body</p>,
	},
];

// Radix tabs activate on mousedown, not click.
function select(tab: HTMLElement): void {
	fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
}

describe('PageTabs', () => {
	it('renders one tab per item and only the active content', () => {
		render(
			<PageTabs
				label="Service sections"
				tabs={tabs}
				value="overview"
				onValueChange={jest.fn()}
			/>,
		);

		expect(screen.getByRole('tablist', { name: 'Service sections' })).toHaveClass(
			'fs-ui',
		);
		expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
			'aria-selected',
			'true',
		);
		expect(screen.getByRole('tab', { name: /DB Call Metrics/ })).toHaveAttribute(
			'aria-selected',
			'false',
		);
		expect(screen.getByText('3')).toBeInTheDocument();
		expect(screen.getByText('overview body')).toBeInTheDocument();
		expect(screen.queryByText('db body')).not.toBeInTheDocument();
	});

	it('reports the selected tab and follows the controlled value', () => {
		const onValueChange = jest.fn();
		const { rerender } = render(
			<PageTabs
				label="Service sections"
				tabs={tabs}
				value="overview"
				onValueChange={onValueChange}
			/>,
		);

		select(screen.getByTestId('page-tab-db'));
		expect(onValueChange).toHaveBeenCalledWith('db');

		rerender(
			<PageTabs
				label="Service sections"
				tabs={tabs}
				value="db"
				onValueChange={onValueChange}
			/>,
		);

		expect(screen.getByText('db body')).toBeInTheDocument();
		expect(screen.queryByText('overview body')).not.toBeInTheDocument();
	});
});
