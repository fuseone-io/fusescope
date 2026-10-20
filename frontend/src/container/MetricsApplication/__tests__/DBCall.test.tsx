import { useEffect } from 'react';
import { Route } from 'react-router-dom';
import ROUTES from 'constants/routes';
import { render, screen } from 'tests/test-utils';
import { MetricRangePayloadProps } from 'types/api/metrics/getQueryRange';

import DBCall from '../Tabs/DBCall';

let mockGraphData: MetricRangePayloadProps['data'] | undefined;

jest.mock('container/WidgetCard/Card', () => ({
	__esModule: true,
	default: ({
		getGraphData,
	}: {
		getGraphData?: (data?: MetricRangePayloadProps['data']) => void;
	}): JSX.Element => {
		useEffect(() => getGraphData?.(mockGraphData), [getGraphData]);
		return <div data-testid="db-chart" />;
	},
}));

const NO_SERIES = {
	result: [{ queryName: 'A', metric: {}, values: [] }],
	resultType: '',
} as unknown as MetricRangePayloadProps['data'];

const MYSQL = {
	result: [
		{
			queryName: 'A',
			metric: { 'db.system': 'mysql' },
			values: [[1_700_000_000, '2']],
		},
	],
	resultType: '',
} as unknown as MetricRangePayloadProps['data'];

function renderDbTab(): void {
	render(<Route path={ROUTES.SERVICE_METRICS} component={DBCall} />, undefined, {
		initialRoute: '/services/frontend',
	});
}

describe('DB Call Metrics tab', () => {
	it('explains that DB call metrics need db.system spans when there are none', async () => {
		mockGraphData = NO_SERIES;
		renderDbTab();

		const empty = await screen.findByTestId('db-calls-empty');
		expect(empty).toHaveTextContent('db.system');
		expect(screen.getByRole('link', { name: /instrument/i })).toHaveAttribute(
			'href',
			expect.stringMatching(/\/sending-data\/instrumentation\/$/),
		);
	});

	it('shows the charts when the service makes database calls', () => {
		mockGraphData = MYSQL;
		renderDbTab();

		expect(screen.queryByTestId('db-calls-empty')).not.toBeInTheDocument();
		expect(screen.getAllByTestId('db-chart')[0]).toBeVisible();
	});
});
