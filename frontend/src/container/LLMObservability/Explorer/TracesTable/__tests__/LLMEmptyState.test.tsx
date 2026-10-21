import { render, screen } from 'tests/test-utils';

import TracesTable from '../TracesTable';

const renderEmpty = (isFilterApplied: boolean): void => {
	render(
		<TracesTable
			data={[]}
			columns={[]}
			panelType="TRACE"
			getRowHref={(): string => '/trace/abc'}
			isLoading={false}
			isFetching={false}
			isError={false}
			error={null}
			isFilterApplied={isFilterApplied}
		/>,
	);
};

describe('TracesTable empty states', () => {
	it('walks through the AI onboarding when the window has no spans', () => {
		renderEmpty(false);

		expect(screen.getByTestId('llm-empty-state')).toHaveTextContent(
			'No LLM, tool or agent spans yet',
		);
		expect(screen.queryByText(/Sending traces to/i)).not.toBeInTheDocument();
	});

	it.each([
		['llm-empty-state-docs', '/sending-data/instrumentation/'],
		[
			'llm-empty-state-mapping-test',
			'/ai-observability/attribute-mapping?tab=test',
		],
		['llm-empty-state-pricing', '/ai-observability/configuration'],
	])('links %s to %s', (testId, href) => {
		renderEmpty(false);

		expect(screen.getByTestId(testId).getAttribute('href')).toContain(href);
	});

	it('keeps the no-results state when a filter is applied', () => {
		renderEmpty(true);

		expect(screen.queryByTestId('llm-empty-state')).not.toBeInTheDocument();
	});
});
