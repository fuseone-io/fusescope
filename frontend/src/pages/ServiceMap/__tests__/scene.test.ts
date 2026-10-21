import { ColorMode, MapEdge, MapNode, ServiceMapGraph } from '../types';
import { layeredLayout } from '../utils/layout';
import { buildScene, SceneFocus } from '../utils/scene';
import { SERVICE_KIND_STUB } from './fixtures';

const node = (id: string, errorRate = 0, rate = 1): MapNode => ({
	id,
	inferred: false,
	kind: SERVICE_KIND_STUB,
	rate,
	errorRate,
});
const edge = (
	source: string,
	target: string,
	errorRate = 0,
	rate = 1,
): MapEdge => ({
	source,
	target,
	rate,
	errorRate,
	p99: 40,
});

const graph: ServiceMapGraph = {
	nodes: [
		node('frontend', 0, 5),
		node('driver'),
		node('redis', 18.5),
		node('route', 0, 4),
	],
	edges: [
		edge('frontend', 'driver'),
		edge('driver', 'redis', 18.5, 5),
		edge('frontend', 'route', 0, 4),
	],
};
const layout = layeredLayout(
	graph.nodes.map((item) => item.id),
	graph.edges,
);

const scene = (focus: Partial<SceneFocus>, colorMode: ColorMode = 'health') =>
	buildScene(graph, layout, {
		selected: null,
		hovered: null,
		path: null,
		search: '',
		colorMode,
		...focus,
	});

const dimmed = (focus: Partial<SceneFocus>): string[] =>
	scene(focus)
		.nodes.filter((item) => item.dimmed)
		.map((item) => item.node.id)
		.sort();

const hot = (focus: Partial<SceneFocus>): string[] =>
	scene(focus)
		.edges.filter((item) => item.hot)
		.map((item) => item.key)
		.sort();

describe('buildScene', () => {
	it('dims nothing and heats nothing without a focus', () => {
		expect(dimmed({})).toStrictEqual([]);
		expect(hot({})).toStrictEqual([]);
	});

	it('focuses the hovered node neighbourhood over the selection', () => {
		expect(dimmed({ selected: 'route', hovered: 'driver' })).toStrictEqual([
			'route',
		]);
		expect(hot({ selected: 'route', hovered: 'driver' })).toStrictEqual([
			'driver>redis',
			'frontend>driver',
		]);
	});

	it('focuses the selected node when nothing is hovered', () => {
		expect(dimmed({ selected: 'route' })).toStrictEqual(['driver', 'redis']);
	});

	it('focuses the highlighted path first', () => {
		expect(dimmed({ path: ['driver', 'redis'], hovered: 'route' })).toStrictEqual(
			['frontend', 'route'],
		);
		expect(hot({ path: ['driver', 'redis'] })).toStrictEqual(['driver>redis']);
	});

	it('dims what the search does not match', () => {
		expect(dimmed({ search: 'RE' })).toStrictEqual([
			'driver',
			'frontend',
			'route',
		]);
	});

	it('colours failing calls and labels hot ones', () => {
		const edges = scene({ hovered: 'redis' }).edges;
		const failing = edges.find((item) => item.key === 'driver>redis');
		expect(failing).toMatchObject({ tone: 'error', hot: true });
		expect(failing?.label).toBe('5.00 req/s · 18.5% · p99 40 ms');
		expect(
			edges.find((item) => item.key === 'frontend>route')?.label,
		).toBeUndefined();
	});

	it('draws heavier calls with wider lines', () => {
		const widths = Object.fromEntries(
			scene({}).edges.map((item) => [item.key, item.width]),
		);
		expect(widths['driver>redis']).toBeGreaterThan(widths['frontend>driver']);
	});

	it('sizes nodes by throughput only in that mode', () => {
		const sizes = (mode: ColorMode): number[] =>
			scene({}, mode).nodes.map((item) => item.size);
		expect(new Set(sizes('health')).size).toBe(1);
		expect(new Set(sizes('throughput')).size).toBeGreaterThan(1);
	});
});
