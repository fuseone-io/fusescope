import { render, screen } from 'tests/test-utils';
import IngestionGate from '../components/IngestionGate';

describe('RUM ingestion warnings', () => {
	it.each([
		['http://rum.example.com', true],
		['https://rum.example.net', false],
		['http://localhost:4319', false],
		['http://127.0.0.1:4319', false],
		['http://[::1]:4319', false],
	])('warns about mixed content for %s: %s', (endpoint, warning) => {
		render(
			<IngestionGate state={{ status: 'ready', endpoint, derived: false }} web>
				<span data-testid="init">init</span>
			</IngestionGate>,
		);
		expect(Boolean(screen.queryByTestId('rum-ingestion-mixed-content'))).toBe(
			warning,
		);
		expect(screen.getByTestId('init')).toBeInTheDocument();
	});
});
