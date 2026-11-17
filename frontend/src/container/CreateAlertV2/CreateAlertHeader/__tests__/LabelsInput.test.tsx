import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithAlertsI18n } from 'tests/alertsI18n';

import LabelsInput from '../LabelsInput';
import { LabelsInputProps } from '../types';

const KEY = 'alert-labels-key-input';
const VALUE = 'alert-labels-value-input';

function renderLabelsInput(props: Partial<LabelsInputProps> = {}): {
	onLabelsChange: jest.Mock;
	validateLabelsKey: jest.Mock;
} {
	const onLabelsChange = jest.fn();
	const validateLabelsKey = jest.fn().mockReturnValue(null);
	renderWithAlertsI18n(
		<LabelsInput
			labels={{}}
			onLabelsChange={onLabelsChange}
			validateLabelsKey={validateLabelsKey}
			{...props}
		/>,
	);
	return { onLabelsChange, validateLabelsKey };
}

describe('LabelsInput', () => {
	it('renders every label, severity included, as a removable chip', () => {
		const { onLabelsChange } = renderLabelsInput({
			labels: { severity: 'high', environment: 'production' },
		});

		expect(screen.getByTestId('label-pill-severity-high')).toHaveTextContent(
			'severity: high',
		);
		expect(
			screen.getByTestId('label-pill-environment-production'),
		).toBeInTheDocument();

		fireEvent.click(
			screen.getByRole('button', { name: 'Remove label severity' }),
		);
		expect(onLabelsChange).toHaveBeenCalledWith({ environment: 'production' });
	});

	it('adds a label from the key and value fields', async () => {
		const { onLabelsChange, validateLabelsKey } = renderLabelsInput({
			labels: { team: 'payments' },
		});

		await userEvent.type(screen.getByTestId(KEY), 'severity{enter}');
		await userEvent.type(screen.getByTestId(VALUE), 'high{enter}');

		expect(validateLabelsKey).toHaveBeenCalledWith('severity');
		expect(onLabelsChange).toHaveBeenCalledWith({
			team: 'payments',
			severity: 'high',
		});
	});

	it('shows a group-by key rejection inline and adds nothing', async () => {
		const validateLabelsKey = jest
			.fn()
			.mockImplementation((key: string) =>
				key === 'service.name' ? 'Cannot use service.name as a key' : null,
			);
		const { onLabelsChange } = renderLabelsInput({ validateLabelsKey });

		await userEvent.type(screen.getByTestId(KEY), 'service.name{enter}');
		await userEvent.type(screen.getByTestId(VALUE), 'api{enter}');

		expect(screen.getByRole('alert')).toHaveTextContent(
			'Cannot use service.name as a key',
		);
		expect(onLabelsChange).not.toHaveBeenCalled();
	});

	it('replaces the value of an existing key once the key validates', async () => {
		const { onLabelsChange } = renderLabelsInput({
			labels: { team: 'payments' },
		});

		await userEvent.type(screen.getByTestId(KEY), 'team:checkout{enter}');

		expect(onLabelsChange).toHaveBeenCalledWith({ team: 'checkout' });
	});

	it('clears every label after confirmation', async () => {
		const { onLabelsChange } = renderLabelsInput({
			labels: { team: 'payments', env: 'prod' },
		});

		await userEvent.click(screen.getByTestId('alert-labels-clear-button'));
		await userEvent.click(
			await screen.findByTestId('alert-labels-clear-confirm'),
		);

		expect(onLabelsChange).toHaveBeenCalledWith({});
	});
});
