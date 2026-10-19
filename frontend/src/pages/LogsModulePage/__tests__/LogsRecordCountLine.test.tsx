import { render, screen } from '@testing-library/react';
import { useLogsRecordCount } from 'container/LogsExplorerViews/useLogsRecordCount';

import LogsRecordCountLine from '../LogsRecordCountLine';

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

describe('LogsRecordCountLine', () => {
	it('reads the count with separators and the time range', () => {
		useLogsRecordCount.setState({ count: 9254 });
		render(<LogsRecordCountLine />);

		expect(screen.getByTestId('logs-record-count')).toHaveTextContent(
			'9,254 records in the last 30 minutes',
		);
		expect(screen.getByText('9,254').tagName).toBe('STRONG');
	});

	it('shows nothing without a count', () => {
		useLogsRecordCount.setState({ count: null });
		render(<LogsRecordCountLine />);

		expect(screen.queryByTestId('logs-record-count')).not.toBeInTheDocument();
	});
});
