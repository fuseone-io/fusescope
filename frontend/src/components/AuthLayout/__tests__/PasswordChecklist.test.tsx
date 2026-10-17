import { render, screen } from 'tests/test-utils';

import PasswordChecklist from '../PasswordChecklist';

const stateOf = (label: RegExp): string | null =>
	screen.getByText(label).closest('li')?.getAttribute('data-state') ?? null;

describe('PasswordChecklist', () => {
	it('lists every requirement of the backend policy', () => {
		render(<PasswordChecklist password="" />);

		expect(screen.getByText(/12 characters or more/i)).toBeInTheDocument();
		expect(screen.getByText(/upper and lower case/i)).toBeInTheDocument();
		expect(screen.getByText(/a number/i)).toBeInTheDocument();
		expect(screen.getByText(/a symbol/i)).toBeInTheDocument();
	});

	it('marks the requirements the password meets', () => {
		render(<PasswordChecklist password="Fusescope2026" />);

		expect(stateOf(/12 characters or more/i)).toBe('met');
		expect(stateOf(/upper and lower case/i)).toBe('met');
		expect(stateOf(/a number/i)).toBe('met');
		expect(stateOf(/a symbol/i)).toBe('unmet');
	});

	it('names the allowed symbols when the password has another character', () => {
		render(<PasswordChecklist password="Fusescope 2026!" />);

		expect(
			screen.getByText(/use only letters, numbers and these symbols/i),
		).toBeInTheDocument();
	});
});
