import { render, screen } from '@testing-library/react';

import HttpStatusCodeBadge, {
	httpStatusTone,
} from '../components/HttpStatusCodeBadge';

describe('HttpStatusCodeBadge', () => {
	it.each([
		[200, 'success'],
		[302, 'info'],
		[404, 'warning'],
		[503, 'error'],
		[101, 'neutral'],
	])('gives %s the %s tone', (code, tone) => {
		expect(httpStatusTone(code)).toBe(tone);
	});

	it('renders the code with its tone', () => {
		render(<HttpStatusCodeBadge statusCode="503" testId="status" />);

		expect(screen.getByTestId('status')).toHaveTextContent('503');
		expect(screen.getByTestId('status')).toHaveAttribute('data-tone', 'error');
	});

	it.each(['', '0', 'abc'])('renders nothing for %p', (code) => {
		const { container } = render(<HttpStatusCodeBadge statusCode={code} />);

		expect(container).toBeEmptyDOMElement();
	});
});
