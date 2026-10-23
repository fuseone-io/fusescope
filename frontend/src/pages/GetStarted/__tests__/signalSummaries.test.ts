import type { OnboardingtypesStatusDTO } from 'api/generated/services/fuseScope.schemas';

import { signalSummaries } from '../utils';

const NOW = 1_800_000_000_000;

const EMPTY: OnboardingtypesStatusDTO = {
	since: NOW - 3_600_000,
	until: NOW,
	service: null,
	traces: {
		received: false,
		count: 0,
		firstSeen: null,
		lastSeen: null,
		operations: 0,
	},
	metrics: {
		received: false,
		count: 0,
		firstSeen: null,
		lastSeen: null,
		series: 0,
	},
	logs: { received: false, count: 0, firstSeen: null, lastSeen: null },
};

describe('signalSummaries', () => {
	it('says what to do for each signal with no data', () => {
		expect(signalSummaries(EMPTY, NOW)).toStrictEqual([
			{
				key: 'traces',
				name: 'Traces',
				received: false,
				detail: 'Instrument an app below',
			},
			{
				key: 'metrics',
				name: 'Metrics',
				received: false,
				detail: 'Run the collector or add a host',
			},
			{
				key: 'logs',
				name: 'Logs',
				received: false,
				detail: 'Ship files or container logs',
			},
		]);
	});

	it('counts what arrived and when', () => {
		const status: OnboardingtypesStatusDTO = {
			...EMPTY,
			traces: {
				received: true,
				count: 54330,
				firstSeen: NOW - 60_000,
				lastSeen: NOW - 2_000,
				operations: 11,
			},
			metrics: {
				received: true,
				count: 16620,
				firstSeen: NOW - 60_000,
				lastSeen: NOW - 10_000,
				series: 277,
			},
			logs: {
				received: true,
				count: 9698,
				firstSeen: NOW - 60_000,
				lastSeen: NOW - 1_000,
			},
		};

		expect(signalSummaries(status, NOW).map((s) => s.detail)).toStrictEqual([
			'54,330 spans · 11 operations · last a few seconds ago',
			'277 series · last a few seconds ago',
			'9,698 records · last a few seconds ago',
		]);
	});

	it('treats a signal left out of the response as not received', () => {
		expect(signalSummaries({ ...EMPTY, metrics: null }, NOW)[1].received).toBe(
			false,
		);
	});

	it('has nothing to show before the status loads', () => {
		expect(signalSummaries(undefined, NOW).every((s) => !s.received)).toBe(true);
	});
});
