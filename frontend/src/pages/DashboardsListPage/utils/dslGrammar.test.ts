import { literal } from './dslGrammar';

describe('literal', () => {
	it.each([
		['plain', "'plain'"],
		["it's", "'it\\'s'"],
		['C:\\temp', "'C:\\\\temp'"],
		['ends with \\', "'ends with \\\\'"],
		["x\\' OR name = 'y", "'x\\\\\\' OR name = \\'y'"],
	])('quotes %s as a single DSL string', (value, expected) => {
		expect(literal(value)).toBe(expected);
	});
});
