/** Mirrors `IsPasswordValid` in `pkg/types/factor_password.go`. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_SYMBOLS = '~!@#$%^&*()_+`-={}|[]\\:"<>?,./';

export type PasswordRequirementId = 'length' | 'case' | 'number' | 'symbol';

export interface PasswordRequirement {
	id: PasswordRequirementId;
	label: string;
	met: boolean;
}

const UPPER = /\p{Lu}/u;
const LOWER = /\p{Ll}/u;
const NUMBER = /\p{N}/u;
const LETTER = /\p{L}/u;

const isSymbol = (char: string): boolean => PASSWORD_SYMBOLS.includes(char);

export function getPasswordRequirements(
	password: string,
): PasswordRequirement[] {
	const chars = Array.from(password);

	return [
		{
			id: 'length',
			label: `${PASSWORD_MIN_LENGTH} characters or more`,
			met: chars.length >= PASSWORD_MIN_LENGTH,
		},
		{
			id: 'case',
			label: 'Upper and lower case',
			met: UPPER.test(password) && LOWER.test(password),
		},
		{ id: 'number', label: 'A number', met: NUMBER.test(password) },
		{
			id: 'symbol',
			label: 'A symbol, like ! @ # -',
			met: chars.some(isSymbol),
		},
	];
}

export function hasDisallowedCharacters(password: string): boolean {
	return Array.from(password).some(
		(char) => !LETTER.test(char) && !NUMBER.test(char) && !isSymbol(char),
	);
}

export function isPasswordValid(password: string): boolean {
	return (
		getPasswordRequirements(password).every((requirement) => requirement.met) &&
		!hasDisallowedCharacters(password)
	);
}
