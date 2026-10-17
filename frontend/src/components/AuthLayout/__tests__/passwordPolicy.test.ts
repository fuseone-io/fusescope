import {
	getPasswordRequirements,
	hasDisallowedCharacters,
	isPasswordValid,
} from '../passwordPolicy';

const unmet = (password: string): string[] =>
	getPasswordRequirements(password)
		.filter((requirement) => !requirement.met)
		.map((requirement) => requirement.id);

describe('passwordPolicy', () => {
	it.each([
		['', ['length', 'case', 'number', 'symbol']],
		['short', ['length', 'case', 'number', 'symbol']],
		['alllowercase1!', ['case']],
		['ALLUPPERCASE1!', ['case']],
		['NoNumbersHere!', ['number']],
		['NoSymbolsHere1', ['symbol']],
		['Short1!a', ['length']],
		['Fusescope2026!', []],
		['Observability!2026', []],
	])('%j leaves %j unmet', (password, expected) => {
		expect(unmet(password)).toStrictEqual(expected);
	});

	it.each('~!@#$%^&*()_+`-={}|[]\\:"<>?,./'.split(''))(
		'accepts %s as a symbol',
		(symbol) => {
			expect(isPasswordValid(`Fusescope2026${symbol}`)).toBe(true);
		},
	);

	it.each([' ', "'", ';', '€'])(
		'rejects %j, which is not an allowed symbol',
		(char) => {
			const password = `Fusescope2026!${char}`;
			expect(hasDisallowedCharacters(password)).toBe(true);
			expect(isPasswordValid(password)).toBe(false);
		},
	);

	it('is valid only when every requirement is met', () => {
		expect(isPasswordValid('Fusescope2026')).toBe(false);
		expect(isPasswordValid('Fusescope2026!')).toBe(true);
	});
});
