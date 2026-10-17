import { MouseEvent } from 'react';
import history from 'lib/history';
import { isModifierKeyPressed } from 'utils/app';
import { openInNewTab } from 'utils/navigation';

/** "John Doe" → "JD"; falls back to the email's first letter. */
export function getInitials(displayName: string, email: string): string {
	const words = displayName.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) {
		return email.charAt(0).toUpperCase();
	}
	return words
		.slice(0, 2)
		.map((word) => word.charAt(0).toUpperCase())
		.join('');
}

/** "ADMIN" → "Admin". */
export function formatRole(role: string): string {
	return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

/** Opens `path` in a new tab on a modifier click, otherwise navigates. */
export function openRoute(path: string, event: MouseEvent): void {
	if (isModifierKeyPressed(event)) {
		openInNewTab(path);
	} else {
		history.push(path);
	}
}
