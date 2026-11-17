import { createInstance, i18n as I18n } from 'i18next';

import en from '../../../../../public/locales/en/alerts.json';
import enGB from '../../../../../public/locales/en-GB/alerts.json';
import { conditionSummary } from '../summary';

const ANOMALY = 'anomaly_rule';
const THRESHOLD = 'threshold_rule';

async function translator(
	lng: string,
	alerts: Record<string, string>,
): Promise<I18n> {
	const i18n = createInstance();
	await i18n.init({
		lng,
		resources: { [lng]: { alerts } },
		defaultNS: 'alerts',
		interpolation: { escapeValue: false },
	});
	return i18n;
}

describe.each([
	{ lng: 'en', alerts: en },
	{ lng: 'en-GB', alerts: enGB },
])('conditionSummary ($lng)', ({ lng, alerts }) => {
	let i18n: I18n;

	beforeAll(async () => {
		i18n = await translator(lng, alerts);
	});

	it.each([
		{
			seasonality: 'hourly',
			op: '1',
			target: 3,
			expected:
				'Notify when A is 3 deviations above the predicted value at least once in the last 5 mins, against the previous 4 hours.',
		},
		{
			seasonality: 'daily',
			op: '2',
			target: 1,
			expected:
				'Notify when A is 1 deviation below the predicted value at least once in the last 5 mins, against the previous 4 days.',
		},
		{
			seasonality: 'weekly',
			op: '7',
			target: 2,
			expected:
				'Notify when A is 2 deviations above or below the predicted value at least once in the last 5 mins, against the previous 4 weeks.',
		},
	])(
		'describes an anomaly rule with $seasonality seasonality',
		({ seasonality, op, target, expected }) => {
			expect(
				conditionSummary(
					{
						ruleType: ANOMALY,
						queryName: 'A',
						op,
						target,
						matchType: '1',
						evalWindow: '5m0s',
						seasonality,
					},
					i18n.t,
				),
			).toBe(expected);
		},
	);

	it.each([
		{ matchType: '1', phrase: 'at least once in the last 10 mins' },
		{ matchType: '2', phrase: 'all the time in the last 10 mins' },
		{ matchType: '3', phrase: 'on average over the last 10 mins' },
		{ matchType: '4', phrase: 'in total over the last 10 mins' },
		{ matchType: '5', phrase: 'at the last point of the last 10 mins' },
	])('describes match type $matchType', ({ matchType, phrase }) => {
		expect(
			conditionSummary(
				{
					ruleType: THRESHOLD,
					queryName: 'B',
					op: '1',
					target: 500,
					unitLabel: 'ms',
					matchType,
					evalWindow: '10m0s',
				},
				i18n.t,
			),
		).toBe(`Notify when B is above 500 ms ${phrase}.`);
	});

	it.each([
		{ op: '2', word: 'below' },
		{ op: '3', word: 'equal to' },
		{ op: '4', word: 'not equal to' },
	])('describes threshold op $op', ({ op, word }) => {
		expect(
			conditionSummary(
				{
					ruleType: THRESHOLD,
					queryName: 'A',
					op,
					target: 0,
					matchType: '2',
					evalWindow: '1h0m0s',
				},
				i18n.t,
			),
		).toBe(`Notify when A is ${word} 0 all the time in the last 60 mins.`);
	});

	it('falls back to defaults when the query and threshold are unset', () => {
		expect(conditionSummary({ ruleType: THRESHOLD }, i18n.t)).toBe(
			'Notify when the selected query is above the threshold at least once in the last 5 mins.',
		);
	});
});
