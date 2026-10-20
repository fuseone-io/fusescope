import type { VariableSelection } from '../selectionTypes';

/** A selection in full, for the hover hint of a pill that truncates it. */
export function selectionTitle(
	selection: VariableSelection,
): string | undefined {
	if (selection.allSelected) {
		return 'ALL';
	}
	const value = Array.isArray(selection.value)
		? selection.value.map(String).join(', ')
		: String(selection.value ?? '');
	return value || undefined;
}
