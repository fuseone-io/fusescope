import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useGetTraceAggregations from 'hooks/trace/useGetTraceAggregations';
import { render } from 'tests/test-utils';

import TraceDetailsHeader from '../TraceDetailsHeader';
import { useTraceSummary } from '../useTraceSummary';

jest.mock('../useTraceSummary', () => ({
	useTraceSummary: jest.fn(),
}));

jest.mock('hooks/trace/useGetTraceAggregations', () => ({
	__esModule: true,
	default: jest.fn(),
}));

jest.mock('react-router-dom', () => ({
	...jest.requireActual('react-router-dom'),
	useParams: (): { id: string } => ({ id: 'trace-123' }),
}));

jest.mock(
	'../../TraceWaterfall/TraceWaterfallStates/Success/Filters/Filters',
	() => ({
		__esModule: true,
		default: (): JSX.Element => <div data-testid="filters-stub" />,
	}),
);

jest.mock('components/FieldsSelector', () => ({
	__esModule: true,
	default: (): null => null,
}));

describe('TraceDetailsHeader – analytics', () => {
	beforeEach(() => {
		jest.mocked(useTraceSummary).mockReturnValue({
			data: {
				startTimestampMillis: 1_700_000_000_000,
				endTimestampMillis: 1_700_000_120_000,
				rootServiceName: 'frontend',
				rootServiceEntryPoint: 'GET /checkout',
				rootSpanStatusCode: '200',
				hasMissingSpans: false,
				totalSpansCount: 3,
				totalErrorSpansCount: 0,
			},
			isLoading: false,
			isError: false,
		});
		jest.mocked(useGetTraceAggregations).mockReturnValue({
			data: undefined,
			isLoading: true,
			isError: false,
		} as unknown as ReturnType<typeof useGetTraceAggregations>);
	});

	it('opens the analytics sheet with its tabs from the Analytics button', async () => {
		const user = userEvent.setup({ delay: null });
		render(
			<TraceDetailsHeader
				onFilteredSpansChange={jest.fn()}
				showTraceDetailsHeaderOptions
			/>,
		);

		expect(
			screen.queryByRole('dialog', { name: 'Analytics' }),
		).not.toBeInTheDocument();

		await user.click(screen.getByRole('button', { name: /^analytics$/i }));

		const sheet = await screen.findByRole('dialog', { name: 'Analytics' });
		expect(
			within(sheet).getByRole('tab', { name: '% exec time' }),
		).toBeInTheDocument();
		expect(within(sheet).getByRole('tab', { name: 'Spans' })).toBeInTheDocument();
		expect(
			within(sheet).getByTestId('trace-analytics-panel'),
		).toBeInTheDocument();
	});

	it('closes the sheet from its close button', async () => {
		// Radix marks <body> pointer-events: none while the sheet is modal.
		const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
		render(
			<TraceDetailsHeader
				onFilteredSpansChange={jest.fn()}
				showTraceDetailsHeaderOptions
			/>,
		);

		await user.click(screen.getByRole('button', { name: /^analytics$/i }));
		const sheet = await screen.findByRole('dialog', { name: 'Analytics' });
		await user.click(within(sheet).getByRole('button', { name: 'Close' }));

		expect(
			screen.queryByRole('dialog', { name: 'Analytics' }),
		).not.toBeInTheDocument();
	});
});
