import { SpanV3 } from 'types/api/trace/getTraceV3';

import { getColorLegend } from '../colorLegend';
import { generateColorPair, RESERVED_ERROR } from '../generateColorPair';

const span = (service: string, hasError = false): SpanV3 =>
	({
		span_id: `${service}-${String(hasError)}`,
		has_error: hasError,
		'service.name': service,
		resource: { 'service.name': service },
		attributes: {},
	}) as unknown as SpanV3;

describe('getColorLegend', () => {
	it('lists each group once, in order of first appearance, with its colour', () => {
		const legend = getColorLegend(
			[span('frontend'), span('driver'), span('frontend'), span('redis')],
			'service.name',
		);

		expect(legend.items).toStrictEqual([
			{ label: 'frontend', ...generateColorPair('frontend') },
			{ label: 'driver', ...generateColorPair('driver') },
			{ label: 'redis', ...generateColorPair('redis') },
		]);
		expect(legend.hasErrors).toBe(false);
	});

	it('keeps the group of an error span and flags the error colour', () => {
		const legend = getColorLegend(
			[span('frontend'), span('payment', true)],
			'service.name',
		);

		expect(legend.items.map((item) => item.label)).toStrictEqual([
			'frontend',
			'payment',
		]);
		expect(legend.hasErrors).toBe(true);
		expect(legend.errorColor).toBe(RESERVED_ERROR);
	});

	it('groups spans without the field under "unknown"', () => {
		const legend = getColorLegend([span('frontend')], 'host.name');

		expect(legend.items.map((item) => item.label)).toStrictEqual(['unknown']);
	});
});
