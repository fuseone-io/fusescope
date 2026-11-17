import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithAlertsI18n } from 'tests/alertsI18n';

import LabelSelect from '..';

const INITIAL = { severity: 'warning', description: 'cpu', team: 'platform' };

function renderLabelSelect(): jest.Mock {
	const onSetLabels = jest.fn();
	renderWithAlertsI18n(
		<LabelSelect onSetLabels={onSetLabels} initialValues={INITIAL} />,
	);
	return onSetLabels;
}

describe('LabelSelect', () => {
	it('shows the editable labels as chips and hides severity and description', () => {
		renderLabelSelect();

		expect(screen.getByTestId('label-pill-team-platform')).toBeInTheDocument();
		expect(screen.queryByText(/^severity/)).not.toBeInTheDocument();
		expect(screen.queryByText(/^description/)).not.toBeInTheDocument();
	});

	it('adds a key:value label and keeps severity and description', async () => {
		const onSetLabels = renderLabelSelect();

		await userEvent.type(
			screen.getByTestId('alert-labels-key-input'),
			'region{enter}',
		);
		await userEvent.type(
			screen.getByTestId('alert-labels-value-input'),
			'us-east-1{enter}',
		);

		expect(onSetLabels).toHaveBeenCalledWith({
			team: 'platform',
			region: 'us-east-1',
			severity: 'warning',
			description: 'cpu',
		});
	});

	it('removes a label and keeps severity and description', () => {
		const onSetLabels = renderLabelSelect();

		fireEvent.click(screen.getByRole('button', { name: 'Remove label team' }));

		expect(onSetLabels).toHaveBeenCalledWith({
			severity: 'warning',
			description: 'cpu',
		});
	});

	it('rejects the keys the form sets elsewhere', async () => {
		const onSetLabels = renderLabelSelect();

		await userEvent.type(
			screen.getByTestId('alert-labels-key-input'),
			'severity{enter}',
		);

		expect(screen.getByRole('alert')).toHaveTextContent(
			'severity is set elsewhere in the form',
		);
		expect(onSetLabels).not.toHaveBeenCalled();
	});
});
