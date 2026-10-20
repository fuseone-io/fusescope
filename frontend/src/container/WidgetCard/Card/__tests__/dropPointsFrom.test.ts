import { QueryData } from 'types/api/widgets/getQuery';

import { dropPointsFrom } from '../utils';

const START = 1_700_000_040;
const END = START + 3 * 60;

const series = (values: [number, string][]): QueryData => ({
	metric: { address: 'mysql' },
	queryName: 'F1',
	values,
});

describe('dropPointsFrom', () => {
	it('drops the bucket the server fills at the window end', () => {
		const [trimmed] = dropPointsFrom(
			[
				series([
					[START, '4'],
					[START + 60, '4'],
					[START + 120, '4'],
					[END, '0'],
				]),
			],
			END,
		);

		expect(trimmed.values).toStrictEqual([
			[START, '4'],
			[START + 60, '4'],
			[START + 120, '4'],
		]);
		expect(trimmed.metric).toStrictEqual({ address: 'mysql' });
	});

	it('keeps series that end inside the window', () => {
		const inside = series([[START, '1']]);

		expect(dropPointsFrom([inside], END)).toStrictEqual([inside]);
	});
});
