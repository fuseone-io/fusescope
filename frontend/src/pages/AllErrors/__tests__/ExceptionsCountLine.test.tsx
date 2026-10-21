// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { render, screen } from '@testing-library/react';

import ExceptionsCountLine from '../ExceptionsCountLine';
import { useAllErrorsQueryState } from '../QueryStateContext';

jest.mock('react-redux', () => ({
	...jest.requireActual('react-redux'),
	useSelector: jest.fn(),
}));

jest.mock('providers/Timezone', () => ({
	useTimezone: (): unknown => ({
		formatTimezoneAdjustedTimestamp: (value: number): string => String(value),
	}),
}));

describe('ExceptionsCountLine', () => {
	beforeEach(() => {
		(useSelector as jest.Mock).mockReturnValue({
			selectedTime: '1d',
			minTime: 0,
			maxTime: 1,
		});
	});

	it('renders nothing until the groups are counted', () => {
		useAllErrorsQueryState.setState({ groupCount: null });
		render(<ExceptionsCountLine />);

		expect(screen.queryByTestId('exceptions-count')).not.toBeInTheDocument();
	});

	it.each<[number, string]>([
		[0, '0 exception groups in the last 1 day'],
		[1, '1 exception group in the last 1 day'],
		[1234, '1,234 exception groups in the last 1 day'],
	])('with %s groups says %s', (groupCount, expected) => {
		useAllErrorsQueryState.setState({ groupCount });
		render(<ExceptionsCountLine />);

		expect(screen.getByTestId('exceptions-count')).toHaveTextContent(expected);
	});
});
