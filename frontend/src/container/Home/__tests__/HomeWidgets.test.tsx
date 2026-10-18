import { render, screen, userEvent } from 'tests/test-utils';

import HomeListItem from '../components/HomeListItem';
import TimeIntervalMenu from '../Services/TimeIntervalMenu';
import { TimeIntervalsEnum } from '../Services/constants';

describe('HomeListItem', () => {
	it('opens the item on click and on Enter', async () => {
		const onOpen = jest.fn();
		render(
			<ul>
				<HomeListItem icon={null} label="Checkout errors" onOpen={onOpen} />
			</ul>,
		);

		const row = screen.getByRole('button', { name: /checkout errors/i });
		await userEvent.click(row);
		row.focus();
		await userEvent.keyboard('{Enter}');

		expect(onOpen).toHaveBeenCalledTimes(2);
	});
});

describe('TimeIntervalMenu', () => {
	it('shows the selected interval and reports the picked one', async () => {
		const onChange = jest.fn();
		// Radix sets `pointer-events: none` on <body> while the menu is open.
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		render(
			<TimeIntervalMenu
				value={TimeIntervalsEnum.LAST_30_MINUTES}
				onChange={onChange}
			/>,
		);

		const trigger = screen.getByTestId('home-services-interval');
		expect(trigger).toHaveTextContent('Last 30 minutes');

		await user.click(trigger);
		await user.click(
			await screen.findByRole('menuitemradio', { name: 'Last 1 hour' }),
		);

		expect(onChange).toHaveBeenCalledWith(TimeIntervalsEnum.LAST_1_HOUR);
	});
});
