import { render, screen } from 'tests/test-utils';

import FieldCell from '../FieldCell';
import { isErrorSpan } from '../utils';

describe('FieldCell', () => {
	it('shows the HTTP method as a neutral badge', () => {
		render(<FieldCell name="http_method" value="GET" row={{ id: '1' }} />);

		const method = screen.getByTestId('http_method');
		expect(method).toHaveTextContent('GET');
		expect(method).toHaveAttribute('data-tone', 'neutral');
	});

	it('shows the response code as plain text, not a badge', () => {
		render(
			<FieldCell name="response_status_code" value="200" row={{ id: '1' }} />,
		);

		const code = screen.getByTestId('response_status_code');
		expect(code).toHaveTextContent('200');
		expect(code).not.toHaveAttribute('data-tone');
	});

	it.each([
		['has_error', true, 'Error', 'error'],
		['has_error', false, 'Ok', 'success'],
		['status_code_string', 'Error', 'Error', 'error'],
		['status_code_string', 'Ok', 'Ok', 'success'],
	])('shows %s=%s as an %s badge', (name, value, label, tone) => {
		render(<FieldCell name={name} value={value} row={{ id: '1' }} />);

		const status = screen.getByTestId(name);
		expect(status).toHaveTextContent(label);
		expect(status).toHaveAttribute('data-tone', tone);
	});

	it('draws the duration bar red for an error span and blue otherwise', () => {
		const { unmount } = render(
			<FieldCell
				name="duration_nano"
				value={50_000_000}
				row={{ id: '1', response_status_code: '503' }}
				maxDurationNano={100_000_000}
			/>,
		);
		expect(screen.getByTestId('duration_nano')).toHaveTextContent('50.00ms');
		const bar = screen.getByTestId('duration-bar');
		expect(bar).toHaveAttribute('data-error', 'true');
		expect(bar.style.width).toBe('50%');

		unmount();
		render(
			<FieldCell
				name="duration_nano"
				value={50_000_000}
				row={{ id: '1', response_status_code: '200' }}
				maxDurationNano={100_000_000}
			/>,
		);
		expect(screen.getByTestId('duration-bar')).toHaveAttribute(
			'data-error',
			'false',
		);
	});
});

describe('isErrorSpan', () => {
	it.each([
		[{ id: '1', has_error: true }, true],
		[{ id: '1', has_error: 'true' }, true],
		[{ id: '1', has_error: false, response_status_code: '503' }, false],
		[{ id: '1', status_code_string: 'Error' }, true],
		[{ id: '1', response_status_code: '503' }, true],
		[{ id: '1', 'http.response.status_code': 500 }, true],
		[{ id: '1', response_status_code: '404' }, false],
		[{ id: '1' }, false],
	])('%j → %s', (row, expected) => {
		expect(isErrorSpan(row)).toBe(expected);
	});
});
