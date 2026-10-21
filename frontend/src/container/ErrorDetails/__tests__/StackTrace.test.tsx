import { fireEvent, render, screen } from '@testing-library/react';

import StackTrace from '../StackTrace';

const copy = jest.fn();
jest.mock('react-use', () => ({
	...jest.requireActual('react-use'),
	useCopyToClipboard: (): unknown => [{}, copy],
}));

const TRACE = [
	'Error: boom',
	'    at a (/app/a.js:1:1)',
	'    at b (/app/node_modules/x/b.js:1:1)',
	'    at c (/app/node_modules/x/c.js:1:1)',
].join('\n');

describe('StackTrace', () => {
	it('folds library frames until they are shown', () => {
		render(<StackTrace text={TRACE} />);

		expect(screen.getAllByTestId('stack-trace-line')).toHaveLength(2);
		expect(screen.getByTestId('stack-trace-folded')).toHaveTextContent(
			'2 library frames hidden',
		);

		fireEvent.click(screen.getByTestId('stack-trace-library-toggle'));

		expect(screen.getAllByTestId('stack-trace-line')).toHaveLength(4);
		expect(screen.queryByTestId('stack-trace-folded')).not.toBeInTheDocument();
		expect(screen.getByTestId('stack-trace-library-toggle')).toHaveAttribute(
			'aria-pressed',
			'true',
		);
	});

	it('copies the whole stack trace', () => {
		render(<StackTrace text={TRACE} />);

		fireEvent.click(screen.getByTestId('stack-trace-copy'));

		expect(copy).toHaveBeenCalledWith(TRACE);
		expect(screen.getByTestId('stack-trace-copy')).toHaveTextContent('Copied');
	});

	it('says so when no stack trace was recorded', () => {
		render(<StackTrace text="" />);

		expect(screen.getByTestId('stack-trace-empty')).toBeInTheDocument();
		expect(screen.queryByTestId('stack-trace-copy')).not.toBeInTheDocument();
	});
});
