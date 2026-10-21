import { getServiceKind } from 'lib/apm/serviceKind';
import { render, screen } from 'tests/test-utils';

import {
	ServiceMapData,
	useServiceMapGraph,
} from '../hooks/useServiceMapGraph';
import ServiceMap from '../index';

jest.mock('../hooks/useServiceMapGraph', () => ({
	useServiceMapGraph: jest.fn(),
}));

jest.mock('container/ResourceAttributesFilter', () => ({
	__esModule: true,
	default: (): JSX.Element => <div data-testid="resource-attributes-filter" />,
}));

const mockGraph = useServiceMapGraph as jest.MockedFunction<
	typeof useServiceMapGraph
>;

const node = (
	id: string,
	errorRate = 0,
): {
	id: string;
	inferred: boolean;
	kind: ReturnType<typeof getServiceKind>;
	rate: number;
	errorRate: number;
} => ({
	id,
	inferred: false,
	kind: getServiceKind({ name: id }),
	rate: 1,
	errorRate,
});

const success = (errorRate: number): ServiceMapData => ({
	status: 'success',
	isFetching: false,
	stats: {},
	graph: {
		nodes: [node('frontend'), node('payment', errorRate)],
		edges: [{ source: 'frontend', target: 'payment', rate: 1, errorRate }],
	},
});

describe('ServiceMap', () => {
	it.each<[string, ServiceMapData, string]>([
		['loading', { status: 'loading' }, 'service-map-loading'],
		['error', { status: 'error', error: new Error('boom') }, 'service-map-error'],
		[
			'empty',
			{ ...success(0), graph: { nodes: [], edges: [] } } as ServiceMapData,
			'service-map-empty',
		],
	])('shows the %s state', (_, data, testId) => {
		mockGraph.mockReturnValue(data);
		render(<ServiceMap />);
		expect(screen.getByTestId('service-map-page')).toBeInTheDocument();
		expect(screen.getByTestId(testId)).toBeInTheDocument();
	});

	it('draws the graph, KPIs and dependencies, and names the root cause', () => {
		mockGraph.mockReturnValue(success(100));
		render(<ServiceMap />);
		expect(screen.getAllByTestId('service-map-node')).toHaveLength(2);
		expect(screen.getByTestId('service-map-kpis')).toBeInTheDocument();
		expect(screen.getByTestId('service-map-root-cause')).toHaveTextContent(
			'Errors are propagating along frontend → payment',
		);
		expect(screen.getAllByTestId('service-map-dependency-row')).toHaveLength(1);
	});

	it('hides the root-cause banner when nothing fails', () => {
		mockGraph.mockReturnValue(success(0));
		render(<ServiceMap />);
		expect(
			screen.queryByTestId('service-map-root-cause'),
		).not.toBeInTheDocument();
	});
});
