import { fireEvent, render, screen } from '@testing-library/react';

import HeaderLegend from '../HeaderLegend';

const series = [
	{ label: 'Timestamp' },
	{ label: '{service.name="frontend"}', stroke: '#3d8be0' },
	{ label: '{service.name="driver"}', stroke: '#c04fe0' },
];

describe('HeaderLegend', () => {
	it('names series by their label value, prefixed by query when asked', () => {
		render(
			<HeaderLegend
				series={series}
				visibility={[]}
				queryNames={['A', 'F1']}
				onSelect={jest.fn()}
			/>,
		);

		expect(screen.getByRole('switch', { name: 'A · frontend' })).toBeChecked();
		expect(screen.getByRole('switch', { name: 'F1 · driver' })).toBeChecked();
	});

	it('reports the clicked series index and shows hidden ones as unchecked', () => {
		const onSelect = jest.fn();
		render(
			<HeaderLegend
				series={series}
				visibility={[true, true, false]}
				onSelect={onSelect}
			/>,
		);

		expect(screen.getByRole('switch', { name: 'driver' })).not.toBeChecked();
		fireEvent.click(screen.getByRole('switch', { name: 'frontend' }));
		expect(onSelect).toHaveBeenCalledWith(1);
	});
});
