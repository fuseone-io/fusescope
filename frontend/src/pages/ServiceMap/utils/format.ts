import { formatPercent, formatRate } from 'lib/apm/format';

import { MapNode } from '../types';
import { Point } from './layout';

const LANGUAGES: Record<string, string> = {
	go: 'GO',
	python: 'PY',
	nodejs: 'JS',
	webjs: 'JS',
	javascript: 'JS',
	java: 'JV',
	dotnet: 'C#',
	cpp: 'C++',
	rust: 'RS',
	ruby: 'RB',
	php: 'PHP',
	swift: 'SW',
	erlang: 'ERL',
};

/** `telemetry.sdk.language` as a two or three letter badge. */
export function languageBadge(
	language: string | undefined,
): string | undefined {
	if (!language) {
		return undefined;
	}
	const key = language.toLowerCase();
	return LANGUAGES[key] ?? key.slice(0, 2).toUpperCase();
}

/** How far a call back to an earlier column swings out to the right. */
const LOOP = 120;

/** A cubic curve from caller to callee, and its midpoint for the label. */
export function edgePath(from: Point, to: Point): { d: string; mid: Point } {
	const forward = to.x > from.x;
	const c1 = forward
		? { x: (from.x + to.x) / 2, y: from.y }
		: { x: from.x + LOOP, y: from.y };
	const c2 = forward
		? { x: (from.x + to.x) / 2, y: to.y }
		: { x: Math.max(from.x, to.x) + LOOP, y: to.y };
	const at = (axis: 'x' | 'y'): number =>
		(from[axis] + 3 * c1[axis] + 3 * c2[axis] + to[axis]) / 8;
	return {
		d: `M${from.x} ${from.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`,
		mid: { x: at('x'), y: at('y') },
	};
}

export function nodeAriaLabel(node: MapNode, health: string): string {
	return [
		node.id,
		node.inferred ? `${node.kind.label} (inferred)` : node.kind.label,
		health,
		formatRate(node.rate),
		`${formatPercent(node.errorRate)} errors`,
	].join(', ');
}
