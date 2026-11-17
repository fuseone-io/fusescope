import { I18nextProvider } from 'react-i18next';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
	alertDefaults,
	anamolyAlertDefaults,
} from 'container/CreateAlertRule/defaults';
import { createInstance } from 'i18next';
import { AlertDef } from 'types/api/alerts/def';
import { EQueryType } from 'types/common/dashboard';

import en from '../../../../public/locales/en/alerts.json';
import RuleOptions from '../RuleOptions';

const QUERY_OPTIONS = [{ label: 'A', value: 'A' }];

async function renderRuleOptions(
	alertDef: AlertDef,
	queryCategory: EQueryType = EQueryType.QUERY_BUILDER,
): Promise<jest.Mock> {
	const i18n = createInstance();
	await i18n.init({
		lng: 'en',
		resources: { en: { alerts: en } },
		interpolation: { escapeValue: false },
	});
	const setAlertDef = jest.fn();
	render(
		<I18nextProvider i18n={i18n}>
			<RuleOptions
				alertDef={alertDef}
				setAlertDef={setAlertDef}
				queryCategory={queryCategory}
				queryOptions={QUERY_OPTIONS}
				yAxisUnit=""
			/>
		</I18nextProvider>,
	);
	return setAlertDef;
}

function openSelect(testId: string): void {
	const select = screen.getByTestId(testId);
	fireEvent.mouseDown(within(select).getByRole('combobox'));
}

function pickOption(label: string): void {
	const options = document.querySelectorAll('.ant-select-item-option');
	const match = Array.from(options).find(
		(option) => option.textContent === label,
	);
	if (!match) {
		throw new Error(`option ${label} not found`);
	}
	fireEvent.click(match);
}

const ANOMALY_DEF: AlertDef = {
	...anamolyAlertDefaults,
	condition: { ...anamolyAlertDefaults.condition, selectedQueryName: 'A' },
};

const THRESHOLD_DEF: AlertDef = {
	...alertDefaults,
	condition: {
		...alertDefaults.condition,
		selectedQueryName: 'A',
		target: 200,
	},
};

describe('RuleOptions', () => {
	describe('anomaly rule', () => {
		it('lays the fields out as labelled Compare and Anomaly groups', async () => {
			await renderRuleOptions(ANOMALY_DEF);

			const compare = screen.getByTestId('alert-condition-group-compare');
			expect(within(compare).getByText('Compare')).toBeInTheDocument();
			for (const label of ['Query', 'During the last', 'Trigger']) {
				expect(within(compare).getByText(label)).toBeInTheDocument();
			}
			expect(
				within(compare).getByTestId('alert-eval-window-select'),
			).toBeInTheDocument();
			expect(
				within(compare).getByTestId('alert-threshold-match-type-select-v1'),
			).toBeInTheDocument();

			const anomaly = screen.getByTestId('alert-condition-group-anomaly');
			for (const label of ['Deviations', 'Direction', 'Seasonality']) {
				expect(within(anomaly).getByText(label)).toBeInTheDocument();
			}
			expect(
				within(anomaly).getByTestId('alert-anomaly-deviation-select'),
			).toBeInTheDocument();
			expect(
				within(anomaly).getByTestId('alert-threshold-op-select'),
			).toBeInTheDocument();
			expect(
				within(anomaly).getByTestId('alert-anomaly-seasonality-select'),
			).toBeInTheDocument();
		});

		it('hides the algorithm select and the threshold fields', async () => {
			await renderRuleOptions(ANOMALY_DEF);

			expect(screen.queryByText('Standard')).not.toBeInTheDocument();
			expect(screen.queryByText(/algorithm/i)).not.toBeInTheDocument();
			expect(
				screen.queryByTestId('alert-threshold-target-input'),
			).not.toBeInTheDocument();
		});

		it('summarises the condition in one sentence', async () => {
			await renderRuleOptions(ANOMALY_DEF);

			expect(screen.getByTestId('alert-condition-summary')).toHaveTextContent(
				'Notify when A is 3 deviations above the predicted value at least once in the last 5 mins, against the previous 4 hours.',
			);
		});

		it('writes the picked deviation and seasonality like before', async () => {
			const setAlertDef = await renderRuleOptions(ANOMALY_DEF);

			openSelect('alert-anomaly-deviation-select');
			pickOption('5');
			expect(setAlertDef).toHaveBeenLastCalledWith({
				...ANOMALY_DEF,
				condition: { ...ANOMALY_DEF.condition, target: 5 },
			});

			openSelect('alert-anomaly-seasonality-select');
			pickOption('Daily');
			expect(setAlertDef).toHaveBeenLastCalledWith({
				...ANOMALY_DEF,
				condition: { ...ANOMALY_DEF.condition, seasonality: 'daily' },
			});
			expect(setAlertDef.mock.calls[1][0].condition.algorithm).toBe('standard');
		});
	});

	describe('threshold rule', () => {
		it('lays every threshold field out in the Compare group', async () => {
			await renderRuleOptions(THRESHOLD_DEF);

			const compare = screen.getByTestId('alert-condition-group-compare');
			for (const label of [
				'Query',
				'Operator',
				'Threshold',
				'During the last',
				'Trigger',
			]) {
				expect(within(compare).getByText(label)).toBeInTheDocument();
			}
			for (const testId of [
				'alert-threshold-op-select',
				'alert-threshold-target-input',
				'alert-eval-window-select',
				'alert-threshold-match-type-select-v1',
			]) {
				expect(within(compare).getByTestId(testId)).toBeInTheDocument();
			}
			expect(
				screen.queryByTestId('alert-condition-group-anomaly'),
			).not.toBeInTheDocument();
			expect(screen.getByText('More options')).toBeInTheDocument();
		});

		it('summarises the threshold condition', async () => {
			await renderRuleOptions(THRESHOLD_DEF);

			expect(screen.getByTestId('alert-condition-summary')).toHaveTextContent(
				'Notify when A is above 200 at least once in the last 5 mins.',
			);
		});

		it('offers the short window list for PromQL queries', async () => {
			await renderRuleOptions(THRESHOLD_DEF, EQueryType.PROM);

			openSelect('alert-eval-window-select');
			const labels = Array.from(
				document.querySelectorAll('.ant-select-item-option'),
			).map((option) => option.textContent);
			expect(labels).toStrictEqual(['5 mins', '10 mins', '15 mins']);
		});
	});
});
