import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ChartPointPopover from '../ChartPointPopover';
import { ChartPointAction } from '../types';

const onTraces = jest.fn();
const onLogs = jest.fn();

const ACTIONS: ChartPointAction[] = [
	{ key: 'traces', label: 'View traces at this time', onSelect: onTraces },
	{ key: 'logs', label: 'View logs at this time', onSelect: onLogs },
];

function Chart(): JSX.Element {
	const [open, setOpen] = useState(true);
	return (
		<div>
			<button
				type="button"
				data-testid="chart"
				onClick={(): void => setOpen(true)}
			>
				chart
			</button>
			{open && (
				<ChartPointPopover
					anchor={{ left: 120, top: 8, height: 200 }}
					time="14:32:10 UTC"
					value="795 ms p99"
					actions={ACTIONS}
					context="±1 min around the point · service.name = frontend"
					onClose={(): void => setOpen(false)}
				/>
			)}
		</div>
	);
}

describe('ChartPointPopover', () => {
	beforeEach(() => {
		onTraces.mockClear();
		onLogs.mockClear();
	});

	it('shows the point time, value and context', () => {
		render(<Chart />);

		const menu = screen.getByRole('menu', { name: 'Drilldown at 14:32:10 UTC' });
		expect(menu).toHaveTextContent('14:32:10 UTC');
		expect(menu).toHaveTextContent('795 ms p99');
		expect(menu).toHaveTextContent(
			'±1 min around the point · service.name = frontend',
		);
	});

	it('draws the time marker at the point while open', async () => {
		render(<Chart />);

		const marker = screen.getByTestId('chart-point-marker');
		expect(marker).toHaveStyle({ left: '120px', top: '8px', height: '200px' });

		await userEvent.keyboard('{Escape}');

		expect(screen.queryByTestId('chart-point-marker')).not.toBeInTheDocument();
	});

	it('runs the chosen item and closes', async () => {
		render(<Chart />);

		await userEvent.click(
			screen.getByRole('menuitem', { name: 'View logs at this time' }),
		);

		expect(onLogs).toHaveBeenCalledTimes(1);
		expect(onTraces).not.toHaveBeenCalled();
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();
	});

	it('moves focus into the menu and between items with the arrow keys', async () => {
		render(<Chart />);

		const [traces, logs] = screen.getAllByRole('menuitem');
		expect(traces).toHaveFocus();

		await userEvent.keyboard('{ArrowDown}');
		expect(logs).toHaveFocus();

		await userEvent.keyboard('{Enter}');
		expect(onLogs).toHaveBeenCalledTimes(1);
	});

	it('closes with Esc and the close button', async () => {
		render(<Chart />);

		await userEvent.keyboard('{Escape}');
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();

		await userEvent.click(screen.getByTestId('chart'));
		await userEvent.click(
			screen.getByRole('button', { name: 'Close drilldown' }),
		);
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();
		expect(onTraces).not.toHaveBeenCalled();
	});

	it('closes on an outside click', async () => {
		render(<Chart />);

		await userEvent.click(document.body);

		expect(screen.queryByRole('menu')).not.toBeInTheDocument();
	});
});
