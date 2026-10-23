import { clientLabel } from '../client';

describe('clientLabel', () => {
	it.each([
		[
			{ browser: 'Chrome', browserVersion: '130', os: 'Windows', osVersion: '10' },
			'Chrome 130 · Windows 10',
		],
		[
			{ browser: 'Firefox', browserVersion: '', os: '', osVersion: '' },
			'Firefox',
		],
		[
			{ browser: '', browserVersion: '', os: 'Linux', osVersion: '' },
			'Unknown · Linux',
		],
		[{ browser: '', browserVersion: '', os: '', osVersion: '' }, '—'],
	])('%j', (client, label) => {
		expect(clientLabel(client)).toBe(label);
	});
});
