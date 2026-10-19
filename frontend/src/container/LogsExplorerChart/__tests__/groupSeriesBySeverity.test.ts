import { QueryData } from 'types/api/widgets/getQuery';

import { groupSeriesBySeverity } from '../utils';

const series = (
	severityText: string,
	severityNumber: string,
	values: [number, string][],
): QueryData =>
	({
		metric: { severity_text: severityText, severity_number: severityNumber },
		queryName: 'A',
		legend: '{{severity_text}}',
		values,
	}) as QueryData;

describe('groupSeriesBySeverity', () => {
	it('sums every spelling of a level into one series per level, in severity order', () => {
		const grouped = groupSeriesBySeverity([
			series('FATAL', '21', [
				[1, '2'],
				[2, '1'],
			]),
			series('Info', '9', [[1, '5']]),
			series('Fatal', '21', [
				[1, '3'],
				[3, '4'],
			]),
			series('critical', '0', [[2, '1']]),
		]);

		expect(grouped.map((s) => s.metric.severity_text)).toStrictEqual([
			'INFO',
			'FATAL',
		]);
		expect(grouped[1].values).toStrictEqual([
			[1, '5'],
			[2, '2'],
			[3, '4'],
		]);
	});

	it('keeps text that names no level apart as Unknown', () => {
		const grouped = groupSeriesBySeverity([series('verbose', '0', [[1, '1']])]);

		expect(grouped[0].metric.severity_text).toBe('UNKNOWN');
	});
});
