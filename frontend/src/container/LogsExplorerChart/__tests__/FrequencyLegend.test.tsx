import { fireEvent, render, screen } from '@testing-library/react';
import { LegendAction } from 'lib/uPlotV2/components/types';
import { LegendItem } from 'lib/uPlotV2/config/types';

import FrequencyLegendItems, {
	cleanLegendLabel,
} from '../FrequencyLegendItems';

const items: LegendItem[] = [
	{ seriesIndex: 1, label: 'INFO', color: '#0f5fb8', show: true },
	{
		seriesIndex: 2,
		label: '{severity_text="error"}',
		color: '#dc2626',
		show: true,
	},
];

describe('FrequencyLegendItems', () => {
	it('reads severity names rather than raw label selectors', () => {
		expect(cleanLegendLabel('{severity_text="error"}')).toBe('error');
		expect(cleanLegendLabel('  WARN ')).toBe('WARN');

		render(<FrequencyLegendItems items={items} onAction={jest.fn()} />);

		expect(screen.getByRole('switch', { name: 'INFO' })).toBeInTheDocument();
		expect(screen.getByRole('switch', { name: 'error' })).toBeInTheDocument();
	});

	it('isolates a series while all are shown, like the chart legend', () => {
		const onAction = jest.fn();
		render(<FrequencyLegendItems items={items} onAction={onAction} />);

		fireEvent.click(screen.getByRole('switch', { name: 'INFO' }));

		expect(onAction).toHaveBeenCalledWith({
			type: LegendAction.SHOW_ONLY,
			seriesIndex: 1,
		});
	});

	it('shows every series again from the only one left', () => {
		const onAction = jest.fn();
		render(
			<FrequencyLegendItems
				items={[items[0], { ...items[1], show: false }]}
				onAction={onAction}
			/>,
		);

		fireEvent.click(screen.getByRole('switch', { name: 'INFO' }));

		expect(onAction).toHaveBeenCalledWith({ type: LegendAction.SHOW_ALL });
	});
});
