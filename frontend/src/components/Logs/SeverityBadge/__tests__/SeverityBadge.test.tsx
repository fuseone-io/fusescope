import { render, screen } from '@testing-library/react';

import { LogType } from '../../LogStateIndicator/LogStateIndicator';
import SeverityBadge from '../SeverityBadge';

describe('SeverityBadge', () => {
	it.each([
		[LogType.ERROR, 'error'],
		[LogType.WARN, 'warning'],
		[LogType.INFO, 'info'],
		[LogType.DEBUG, 'neutral'],
	])('gives %s logs the %s tone', (logType, tone) => {
		render(<SeverityBadge logType={logType} label="text" testId="badge" />);

		expect(screen.getByTestId('badge')).toHaveAttribute('data-tone', tone);
	});

	it('reads the severity text it is given', () => {
		render(<SeverityBadge logType={LogType.WARN} label="Warning" />);

		expect(screen.getByText('Warning')).toBeInTheDocument();
	});
});
