import { render, screen } from '@testing-library/react';
import { useMetricsCount } from 'container/MetricsExplorer/Summary/useMetricsCount';

import MetricsCountLine from '../MetricsCountLine';

jest.mock('react-redux', () => ({
	...jest.requireActual('react-redux'),
	useSelector: (): unknown => ({
		selectedTime: '30m',
		minTime: 1_700_000_000_000_000_000,
		maxTime: 1_700_001_800_000_000_000,
	}),
}));

jest.mock('providers/Timezone', () => ({
	useTimezone: (): { formatTimezoneAdjustedTimestamp: () => string } => ({
		formatTimezoneAdjustedTimestamp: (): string => 'ts',
	}),
}));

describe('MetricsCountLine', () => {
	it('reads the list total and the time range', () => {
		useMetricsCount.setState({ count: 1186 });
		render(<MetricsCountLine />);

		expect(screen.getByTestId('metrics-count')).toHaveTextContent(
			'1,186 metrics received in the last 30 minutes',
		);
		expect(screen.getByText('1,186').tagName).toBe('STRONG');
	});

	it('uses the singular for one metric', () => {
		useMetricsCount.setState({ count: 1 });
		render(<MetricsCountLine />);

		expect(screen.getByTestId('metrics-count')).toHaveTextContent(
			'1 metric received in the last 30 minutes',
		);
	});

	it('shows nothing without a count', () => {
		useMetricsCount.setState({ count: null });
		render(<MetricsCountLine />);

		expect(screen.queryByTestId('metrics-count')).not.toBeInTheDocument();
	});
});
