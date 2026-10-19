import { SpanV3 } from 'types/api/trace/getTraceV3';

/**
 * Computes the visible spans from a complete span list based on collapse state.
 *
 * Relies on spans being in DFS pre-order (as returned by the backend).
 * When a collapsed span is encountered, all its descendants (level > collapsed span's level)
 * are skipped until we reach a sibling or ancestor (level <= collapsed span's level).
 *
 * The strict `>` comparison means "skip children, not siblings" — a span at the same
 * level as the collapsed span passes through because DFS order guarantees all descendants
 * appear contiguously before the next sibling.
 */
export function getVisibleSpans(
	allSpans: SpanV3[],
	uncollapsedNodes: Set<string>,
): SpanV3[] {
	const visible: SpanV3[] = [];
	let skipBelowLevel = Infinity;

	for (const span of allSpans) {
		if (span.level > skipBelowLevel) {
			continue;
		}
		skipBelowLevel = Infinity;
		visible.push(span);

		if (span.has_children && !uncollapsedNodes.has(span.span_id)) {
			skipBelowLevel = span.level;
		}
	}

	return visible;
}

/**
 * Returns the set of ancestor span IDs for a given span.
 * Walks up the tree via parent_span_id until reaching the root.
 */
export function getAncestorSpanIds(
	allSpans: SpanV3[],
	targetSpanId: string,
): Set<string> {
	const spanMap = new Map<string, SpanV3>();
	for (const span of allSpans) {
		spanMap.set(span.span_id, span);
	}

	const ancestors = new Set<string>();
	let current = spanMap.get(targetSpanId);

	while (current && current.parent_span_id) {
		const parent = spanMap.get(current.parent_span_id);
		if (!parent) {
			break;
		}
		ancestors.add(parent.span_id);
		current = parent;
	}

	return ancestors;
}

// Past this share of the timeline a label after the bar would be clipped.
const LABEL_AFTER_LIMIT = 85;
// A bar starting before this share leaves no room for a label in front of it.
const LABEL_BEFORE_MIN = 15;

export interface DurationLabelPlacement {
	side: 'after' | 'before' | 'inside';
	/** `left` for `after`; `right` for `before` and `inside`. Percent of the timeline. */
	offsetPercent: number;
}

/** Where a span's duration label sits relative to its bar, given the bar's left and width in percent. */
export function getDurationLabelPlacement(
	leftPercent: number,
	widthPercent: number,
): DurationLabelPlacement {
	const end = leftPercent + widthPercent;
	if (end <= LABEL_AFTER_LIMIT) {
		return { side: 'after', offsetPercent: end };
	}
	if (leftPercent >= LABEL_BEFORE_MIN) {
		return { side: 'before', offsetPercent: 100 - leftPercent };
	}
	return { side: 'inside', offsetPercent: Math.max(0, 100 - end) };
}
