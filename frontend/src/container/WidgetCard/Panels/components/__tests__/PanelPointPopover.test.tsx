import { render, screen } from '@testing-library/react';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import uPlot from 'uplot';

import PanelPointPopover from '../PanelPointPopover';

dayjs.extend(utc);
dayjs.extend(timezone);

jest.mock('providers/Timezone', () => ({
	useTimezone: (): unknown => ({
		timezone: { value: 'America/Sao_Paulo', offset: 'UTC -03:00' },
		formatTimezoneAdjustedTimestamp: (input: number, format: string): string =>
			dayjs(input).tz('America/Sao_Paulo').format(format),
	}),
}));

function rect(left: number, top: number, height: number): DOMRect {
	return { left, top, width: 600, height } as DOMRect;
}

const over = document.createElement('div');
over.getBoundingClientRect = (): DOMRect => rect(60, 30, 200);

const plot = {
	over,
	valToPos: (value: number): number => (value === 1_700_000_000 ? 250 : -1),
} as unknown as uPlot;

const container = {
	getBoundingClientRect: (): DOMRect => rect(10, 10, 300),
} as unknown as HTMLElement;

const POINT = {
	timestamp: 1_700_000_000,
	timeRange: { startTime: 1_700_000_000, endTime: 1_700_000_060 },
	labels: {},
	value: 795,
	seriesName: 'p99',
};

function renderPopover(unit: string, value = POINT.value): () => void {
	const { unmount } = render(
		<PanelPointPopover
			openPoint={{
				point: { ...POINT, value },
				content: { actions: [], context: 'ctx' },
			}}
			yAxisUnit={unit}
			plot={plot}
			container={container}
			onClose={jest.fn()}
		/>,
	);
	return unmount;
}

describe('PanelPointPopover', () => {
	it('heads the menu with the bucket time in the user timezone', () => {
		renderPopover('ms');

		expect(screen.getByRole('menu')).toHaveTextContent('19:13:20 UTC -03:00');
	});

	it('shows the clicked series value in the chart unit', () => {
		renderPopover('ms');

		expect(screen.getByRole('menu')).toHaveTextContent('795 ms p99');
	});

	it('formats rates with the chart unit', () => {
		renderPopover('reqps', 0.37);

		expect(screen.getByRole('menu')).toHaveTextContent('0.37 req/s p99');
	});

	it('puts the marker at the bucket on the plot', () => {
		renderPopover('ms');

		expect(screen.getByTestId('chart-point-marker')).toHaveStyle({
			left: '300px',
			top: '20px',
			height: '200px',
		});
	});

	it('ends the plot hover while open, so its tooltip stays off the menu', () => {
		const onLeave = jest.fn();
		over.addEventListener('mouseleave', onLeave);

		const unmount = renderPopover('ms');

		expect(onLeave).toHaveBeenCalledTimes(1);
		expect(over).toHaveStyle({ pointerEvents: 'none' });

		unmount();

		expect(over).not.toHaveStyle({ pointerEvents: 'none' });
	});
});
