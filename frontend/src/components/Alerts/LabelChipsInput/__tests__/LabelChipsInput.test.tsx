import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithAlertsI18n } from 'tests/alertsI18n';
import { Labels } from 'types/api/alerts/def';

import LabelChipsInput from '../LabelChipsInput';

const KEY = 'alert-labels-key-input';
const VALUE = 'alert-labels-value-input';
const ADD = 'alert-labels-add-button';

function renderInput(
	labels: Labels = {},
	validateKey?: (key: string) => string | null,
): jest.Mock {
	const onChange = jest.fn();
	renderWithAlertsI18n(
		<LabelChipsInput
			labels={labels}
			onChange={onChange}
			validateKey={validateKey}
		/>,
	);
	return onChange;
}

describe('LabelChipsInput', () => {
	it('renders each label as a removable key: value chip', () => {
		const onChange = renderInput({ team: 'platform', env: 'prod' });

		expect(screen.getByTestId('label-pill-team-platform')).toHaveTextContent(
			'team: platform',
		);
		expect(screen.getByTestId('label-pill-env-prod')).toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: 'Remove label team' }));
		expect(onChange).toHaveBeenCalledWith({ env: 'prod' });
	});

	it('adds a label from the key and value fields with Enter', async () => {
		const onChange = renderInput({ team: 'platform' });

		await userEvent.type(screen.getByTestId(KEY), 'region{enter}');
		expect(screen.getByTestId(VALUE)).toHaveFocus();
		await userEvent.type(screen.getByTestId(VALUE), 'us-east-1{enter}');

		expect(onChange).toHaveBeenCalledWith({
			team: 'platform',
			region: 'us-east-1',
		});
		expect(screen.getByTestId(KEY)).toHaveValue('');
		expect(screen.getByTestId(VALUE)).toHaveValue('');
		expect(screen.getByTestId(KEY)).toHaveFocus();
	});

	it('adds a label with the Add button, trimmed', async () => {
		const onChange = renderInput();

		expect(screen.getByTestId(ADD)).toBeDisabled();
		await userEvent.type(screen.getByTestId(KEY), '  env ');
		expect(screen.getByTestId(ADD)).toBeDisabled();
		await userEvent.type(screen.getByTestId(VALUE), ' prod  ');
		await userEvent.click(screen.getByTestId(ADD));

		expect(onChange).toHaveBeenCalledWith({ env: 'prod' });
	});

	it('moves to the value field when a colon is typed in the key', async () => {
		const onChange = renderInput();

		await userEvent.type(screen.getByTestId(KEY), 'env:');
		expect(screen.getByTestId(KEY)).toHaveValue('env');
		expect(screen.getByTestId(VALUE)).toHaveFocus();
		await userEvent.type(screen.getByTestId(VALUE), 'prod{enter}');

		expect(onChange).toHaveBeenCalledWith({ env: 'prod' });
	});

	it('splits a pasted key:value pair', async () => {
		const onChange = renderInput();

		await userEvent.click(screen.getByTestId(KEY));
		await userEvent.paste('url:http://a:8080');
		expect(screen.getByTestId(KEY)).toHaveValue('url');
		expect(screen.getByTestId(VALUE)).toHaveValue('http://a:8080');
		await userEvent.type(screen.getByTestId(VALUE), '{enter}');

		expect(onChange).toHaveBeenCalledWith({ url: 'http://a:8080' });
	});

	it('does not add a label without a value or a key', async () => {
		const onChange = renderInput();

		await userEvent.type(screen.getByTestId(KEY), 'env{enter}');
		await userEvent.type(screen.getByTestId(VALUE), '   {enter}');
		await userEvent.clear(screen.getByTestId(KEY));
		await userEvent.type(screen.getByTestId(VALUE), 'prod{enter}');

		expect(onChange).not.toHaveBeenCalled();
	});

	it('replaces the value of an existing key', async () => {
		const onChange = renderInput({ team: 'platform', env: 'prod' });

		await userEvent.type(screen.getByTestId(KEY), 'team{enter}');
		await userEvent.type(screen.getByTestId(VALUE), 'payments{enter}');

		expect(onChange).toHaveBeenCalledWith({ team: 'payments', env: 'prod' });
	});

	it('rejects a key that fails validation, even when it already exists', async () => {
		const validateKey = (key: string): string | null =>
			key === 'service' ? 'Cannot use service as a key' : null;
		const onChange = renderInput({ service: 'api' }, validateKey);

		await userEvent.type(screen.getByTestId(KEY), 'service{enter}');

		expect(screen.getByRole('alert')).toHaveTextContent(
			'Cannot use service as a key',
		);
		expect(screen.getByTestId(KEY)).toHaveAttribute('aria-invalid', 'true');
		expect(screen.getByTestId(KEY)).toHaveFocus();

		await userEvent.type(screen.getByTestId(VALUE), 'web{enter}');
		expect(onChange).not.toHaveBeenCalled();

		await userEvent.type(screen.getByTestId(KEY), 's');
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});

	it('clears the draft on Escape', async () => {
		renderInput();

		await userEvent.type(screen.getByTestId(KEY), 'env{enter}');
		await userEvent.type(screen.getByTestId(VALUE), 'pr{escape}');

		expect(screen.getByTestId(KEY)).toHaveValue('');
		expect(screen.getByTestId(VALUE)).toHaveValue('');
	});

	it('clears every label after confirmation', async () => {
		const onChange = renderInput({ team: 'platform', env: 'prod' });

		await userEvent.click(screen.getByTestId('alert-labels-clear-button'));
		const dialog = await screen.findByRole('dialog');
		expect(dialog).toHaveTextContent(
			'This action will remove all the labels. Do you want to proceed?',
		);

		await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
		expect(onChange).not.toHaveBeenCalled();

		await userEvent.click(screen.getByTestId('alert-labels-clear-button'));
		await userEvent.click(
			await screen.findByTestId('alert-labels-clear-confirm'),
		);
		expect(onChange).toHaveBeenCalledWith({});
	});

	it('offers clear all only when there are labels', () => {
		renderInput();

		expect(
			screen.queryByTestId('alert-labels-clear-button'),
		).not.toBeInTheDocument();
	});
});
