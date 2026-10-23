import type { RumtypesClientDTO } from 'api/generated/services/fuseScope.schemas';

const label = (name: string, version: string): string =>
	version ? `${name} ${version}` : name;

/** "Chrome 130 · Windows 10" from a parsed client. */
export function clientLabel(client: RumtypesClientDTO): string {
	if (!client.browser && !client.os) {
		return '—';
	}
	const browser = client.browser
		? label(client.browser, client.browserVersion)
		: 'Unknown';
	return client.os
		? `${browser} · ${label(client.os, client.osVersion)}`
		: browser;
}
