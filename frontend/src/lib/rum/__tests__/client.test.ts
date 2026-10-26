import { RumtypesPlatformDTO } from 'api/generated/services/fuseScope.schemas';

import { clientColumnLabel, clientLabel, mobileClientLabel } from '../client';

describe('clientLabel', () => {
	it.each([
		[
			{
				browser: 'Chrome',
				browserVersion: '130',
				device: '',
				os: 'Windows',
				osVersion: '10',
			},
			'Chrome 130 · Windows 10',
		],
		[
			{
				browser: 'Firefox',
				browserVersion: '',
				device: '',
				os: '',
				osVersion: '',
			},
			'Firefox',
		],
		[
			{ browser: '', browserVersion: '', device: '', os: 'Linux', osVersion: '' },
			'Unknown · Linux',
		],
		[{ browser: '', browserVersion: '', device: '', os: '', osVersion: '' }, '—'],
		[
			{
				browser: '',
				browserVersion: '',
				device: 'Google Pixel 8',
				os: 'Android',
				osVersion: '14',
			},
			'Google Pixel 8 · Android 14',
		],
	])('%j', (client, label) => {
		expect(clientLabel(client)).toBe(label);
	});
});

describe('mobileClientLabel', () => {
	it.each([
		[
			{
				os: 'Android',
				osVersion: '8.1.0',
				manufacturer: 'samsung',
				model: 'SM-G960F',
			},
			'Samsung SM-G960F · Android 8',
		],
		[
			{
				os: 'Android',
				osVersion: '13',
				manufacturer: 'OnePlus',
				model: 'OnePlus 11',
			},
			'OnePlus 11 · Android 13',
		],
		[{ os: 'Android', osVersion: '', manufacturer: '', model: '' }, 'Android'],
	])('%j', (client, label) => {
		expect(mobileClientLabel(client)).toBe(label);
	});
});

describe('clientColumnLabel', () => {
	it('names the device on Android, the browser elsewhere', () => {
		expect(clientColumnLabel(RumtypesPlatformDTO.android)).toBe('Device · OS');
		expect(clientColumnLabel(RumtypesPlatformDTO.web)).toBe('Browser · OS');
		expect(clientColumnLabel(undefined)).toBe('Browser · OS');
	});
});
