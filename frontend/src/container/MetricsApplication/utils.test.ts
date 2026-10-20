import { getTopOperationList } from './__mocks__/getTopOperation';
import { TopOperationList } from './KeyOperations/types';
import {
	convertedTracesToDownloadData,
	getErrorRate,
	getNearestHighestBucketValue,
	getStepAlignedRange,
} from './utils';

describe('Error Rate', () => {
	it('should return correct error rate', () => {
		const list: TopOperationList = getTopOperationList({
			errorCount: 10,
			numCalls: 100,
		});

		expect(getErrorRate(list)).toBe(10);
	});

	it('should handle no errors gracefully', () => {
		const list = getTopOperationList({ errorCount: 0, numCalls: 100 });
		expect(getErrorRate(list)).toBe(0);
	});

	it('should handle zero calls', () => {
		const list = getTopOperationList({ errorCount: 0, numCalls: 0 });
		expect(getErrorRate(list)).toBe(0);
	});
});

describe('getNearestHighestBucketValue', () => {
	it('should return nearest higher bucket value', () => {
		expect(getNearestHighestBucketValue(50, [10, 20, 30, 40, 60, 70])).toBe('60');
	});

	it('should return +Inf for value higher than any bucket', () => {
		expect(getNearestHighestBucketValue(80, [10, 20, 30, 40, 60, 70])).toBe(
			'+Inf',
		);
	});

	it('should return the first bucket for value lower than all buckets', () => {
		expect(getNearestHighestBucketValue(5, [10, 20, 30, 40, 60, 70])).toBe('10');
	});
});

describe('convertedTracesToDownloadData', () => {
	it('should convert trace data correctly', () => {
		const data = [
			{
				name: 'op1',
				p50: 50000000,
				p95: 95000000,
				p99: 99000000,
				numCalls: 100,
				errorCount: 10,
			},
		];

		expect(convertedTracesToDownloadData(data)).toStrictEqual([
			{
				Name: 'op1',
				'P50 (in ms)': '50.00',
				'P95 (in ms)': '95.00',
				'P99 (in ms)': '99.00',
				'Number of calls': '100',
				'Error Rate (%)': '10.00',
			},
		]);
	});
});

describe('getStepAlignedRange', () => {
	const NS_PER_S = 1e9;

	it('ends on the last complete step, so no partial bucket is drawn', () => {
		const minTime = 1_700_000_047 * NS_PER_S;
		const maxTime = (1_700_000_047 + 30 * 60) * NS_PER_S;

		expect(getStepAlignedRange(minTime, maxTime)).toStrictEqual({
			start: 1_700_000_040,
			end: 1_700_001_840,
		});
	});

	it('aligns to the step the charts query with on longer ranges', () => {
		const minTime = 1_700_000_047 * NS_PER_S;
		const maxTime = (1_700_000_047 + 24 * 3600) * NS_PER_S;

		const { start, end } = getStepAlignedRange(minTime, maxTime);

		expect(start % 240).toBe(0);
		expect(end % 240).toBe(0);
		expect(end).toBeLessThanOrEqual(1_700_000_047 + 24 * 3600);
	});
});
