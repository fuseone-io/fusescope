import {
	RumtypesClientDTO,
	RumtypesPlatformDTO,
} from 'api/generated/services/fuseScope.schemas';

const label = (name: string, version: string): string =>
	version ? `${name} ${version}` : name;

/** "Chrome 130 · Windows 10", or "Google Pixel 8 · Android 14" on mobile. */
export function clientLabel(client: RumtypesClientDTO): string {
	if (!client.browser && !client.device && !client.os) {
		return '—';
	}
	const browser = client.browser
		? label(client.browser, client.browserVersion)
		: client.device || 'Unknown';
	return client.os
		? `${browser} · ${label(client.os, client.osVersion)}`
		: browser;
}

export interface MobileClient {
	os: string;
	osVersion: string;
	manufacturer: string;
	model: string;
}

/** The model with its manufacturer, capitalized, unless the model names it. */
export function deviceLabel(manufacturer: string, model: string): string {
	if (
		!manufacturer ||
		model.toLowerCase().startsWith(manufacturer.toLowerCase())
	) {
		return model;
	}
	const maker = manufacturer.charAt(0).toUpperCase() + manufacturer.slice(1);
	return model ? `${maker} ${model}` : maker;
}

/** "Google Pixel 8 · Android 14" from the os.* and device.* resource attributes. */
export function mobileClientLabel(client: MobileClient): string {
	const os = label(client.os, client.osVersion.split('.')[0]);
	const device = deviceLabel(client.manufacturer, client.model);
	return device ? `${device} · ${os}` : os;
}

/** The header of a client column: mobile apps run on devices, not browsers. */
export function clientColumnLabel(
	platform: RumtypesPlatformDTO | undefined,
): string {
	return platform === RumtypesPlatformDTO.android
		? 'Device · OS'
		: 'Browser · OS';
}
