import { OrgSessionContext } from 'types/api/v2/sessions/context/get';

export const orgDisplayName = (org: OrgSessionContext): string =>
	org.name || 'default';

export function orgInitials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	const initials =
		words.length > 1
			? `${words[0][0]}${words[1][0]}`
			: (words[0] ?? '').slice(0, 2);
	return initials.toUpperCase();
}
