import { SegmentedOption } from 'components/PageTemplate/components/SegmentedControl';

import { ColorMode, InferredAttribute, Protocol } from './types';

export const COLOR_MODES: SegmentedOption<ColorMode>[] = [
	{ value: 'health', label: 'Health', testId: 'service-map-color-health' },
	{ value: 'latency', label: 'Latency', testId: 'service-map-color-latency' },
	{
		value: 'throughput',
		label: 'Throughput',
		testId: 'service-map-color-throughput',
	},
];

export const PROTOCOL_LABEL: Record<Protocol, string> = {
	http: 'HTTP',
	grpc: 'gRPC',
	rpc: 'RPC',
	db: 'DB',
	messaging: 'Messaging',
};

/** What each inference reads, for the node panel's note. */
export const INFERRED_FROM_LABEL: Record<InferredAttribute, string> = {
	'db.system': 'db.system',
	'messaging.system': 'messaging.system',
	'peer.service': 'peer.service',
	'server.address': 'server.address / net.peer.name',
};

/** Rows of the dependencies table before "View all". */
export const DEPENDENCY_ROWS = 8;

/** Callers, calls and operations listed in the node panel. */
export const PANEL_ROWS = 6;

/** Node border colour per tone. */
export const RING_CLASS: Record<string, string> = {
	success: 'tw:border-success',
	warning: 'tw:border-warning',
	error: 'tw:border-error',
	primary: 'tw:border-primary',
	info: 'tw:border-primary',
	neutral: 'tw:border-ink-subtle',
};

/** Edge colour per tone; a neutral edge turns primary when in focus. */
export const STROKE_CLASS: Record<string, string> = {
	error: 'tw:stroke-error',
	warning: 'tw:stroke-warning',
	neutral: 'tw:stroke-ink-subtle',
	focus: 'tw:stroke-primary',
};
