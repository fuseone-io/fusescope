import { cn } from 'lib/utils';

describe('cn', () => {
	it.each([
		{
			name: 'joins class names',
			input: ['tw:px-2', 'tw:py-1'],
			expected: 'tw:px-2 tw:py-1',
		},
		{
			name: 'drops falsy values',
			input: ['tw:px-2', false, null, undefined, 0, ''],
			expected: 'tw:px-2',
		},
		{
			name: 'accepts conditional objects and arrays',
			input: [
				{ 'tw:font-bold': true, 'tw:italic': false },
				['tw:text-sm', ['tw:underline']],
			],
			expected: 'tw:font-bold tw:text-sm tw:underline',
		},
		{
			name: 'lets the last conflicting utility win',
			input: ['tw:px-2 tw:py-1', 'tw:px-4'],
			expected: 'tw:py-1 tw:px-4',
		},
		{
			name: 'merges conflicting theme colours',
			input: ['tw:bg-primary tw:text-primary-foreground', 'tw:bg-destructive'],
			expected: 'tw:text-primary-foreground tw:bg-destructive',
		},
		{
			name: 'keeps variant-scoped utilities apart',
			input: ['tw:hover:bg-accent', 'tw:bg-background', 'tw:dark:bg-input/30'],
			expected: 'tw:hover:bg-accent tw:bg-background tw:dark:bg-input/30',
		},
		{
			name: 'leaves unprefixed legacy classes alone',
			input: ['p-2', 'hidden', 'tw:p-3', 'p-4'],
			expected: 'p-2 hidden tw:p-3 p-4',
		},
	])('$name', ({ input, expected }) => {
		expect(cn(...input)).toBe(expected);
	});
});
