import { formatLatencyMs, formatPercent, formatRate } from 'lib/apm/format';

import { ColorMode, MapNode, RingTone, ServiceMapGraph } from '../types';
import { edgePath } from './format';
import { neighbourhood, pathEdges } from './graph';
import { edgeTone, edgeWidth, nodeSize, ringTone } from './health';
import { GraphLayout, Point } from './layout';

export interface SceneFocus {
	selected: string | null;
	hovered: string | null;
	/** The root cause's failing path, when highlighted. */
	path: string[] | null;
	search: string;
	colorMode: ColorMode;
}

export interface DrawnNode {
	node: MapNode;
	position: Point;
	size: number;
	tone: RingTone;
	selected: boolean;
	dimmed: boolean;
}

export interface DrawnEdge {
	key: string;
	d: string;
	mid: Point;
	width: number;
	tone: string;
	hot: boolean;
	opacity: number;
	/** Seconds per dash of the flow animation: busier calls flow faster. */
	flowSeconds: number;
	label?: string;
}

const edgeLabel = (rate: number, errorRate: number, p99?: number): string =>
	[
		formatRate(rate),
		formatPercent(errorRate),
		...(p99 === undefined ? [] : [`p99 ${formatLatencyMs(p99)}`]),
	].join(' · ');

/** What to draw and how, for the graph and the current focus. */
export function buildScene(
	graph: ServiceMapGraph,
	layout: GraphLayout,
	focus: SceneFocus,
): { nodes: DrawnNode[]; edges: DrawnEdge[] } {
	const active = focus.hovered ?? focus.selected;
	const onPath = focus.path && focus.path.length > 1 ? focus.path : null;
	let focused: Set<string> | null = null;
	if (onPath) {
		focused = new Set(onPath);
	} else if (active) {
		focused = neighbourhood(active, graph.edges);
	}
	const hotKeys = onPath ? pathEdges(onPath) : null;
	const term = focus.search.trim().toLowerCase();
	const maxNodeRate = Math.max(0, ...graph.nodes.map((item) => item.rate));
	const maxEdgeRate = Math.max(0, ...graph.edges.map((item) => item.rate));

	const nodes = graph.nodes
		.filter((item) => layout.positions[item.id])
		.map((item) => ({
			node: item,
			position: layout.positions[item.id],
			size: nodeSize(item.rate, maxNodeRate, focus.colorMode),
			tone: ringTone(item, focus.colorMode),
			selected: item.id === focus.selected,
			dimmed:
				(focused !== null && !focused.has(item.id)) ||
				(term !== '' && !item.id.toLowerCase().includes(term)),
		}));

	const edges = graph.edges
		.filter(
			(item) =>
				item.source !== item.target &&
				layout.positions[item.source] &&
				layout.positions[item.target],
		)
		.map((item) => {
			const key = `${item.source}>${item.target}`;
			const hot = hotKeys
				? hotKeys.has(key)
				: active !== null && (item.source === active || item.target === active);
			let opacity = 0.55;
			if (focused) {
				opacity = hot ? 0.9 : 0.12;
			}
			const { d, mid } = edgePath(
				layout.positions[item.source],
				layout.positions[item.target],
			);
			return {
				key,
				d,
				mid,
				width: edgeWidth(item.rate, maxEdgeRate),
				tone: edgeTone(item.errorRate),
				hot,
				opacity,
				flowSeconds: Math.max(0.5, 2.6 - Math.log10(item.rate + 1)),
				label: hot ? edgeLabel(item.rate, item.errorRate, item.p99) : undefined,
			};
		});
	return { nodes, edges };
}
