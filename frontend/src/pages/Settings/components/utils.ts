import { StatusFilterOption } from './types';

export const optionText = (option: StatusFilterOption<string>): string =>
	`${option.label} — ${option.count}`;

/** Up to two letters: first and last word of a name, or the start of an email. */
export function initialsOf(value: string): string {
	const words = value
		.split('@')[0]
		.split(/[\s._-]+/)
		.filter(Boolean);
	if (words.length === 0) {
		return '?';
	}
	const first = words[0].charAt(0);
	const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
	return `${first}${last}`.toUpperCase();
}
