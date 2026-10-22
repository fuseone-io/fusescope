import { sdkSupport } from '../sdk';

const SUPPORTED = [
	{ name: '@fusescope/browser', minVersion: '0.1.0', maxVersion: '1.0.0' },
];

describe('sdkSupport', () => {
	it.each([
		['@fusescope/browser', '0.1.0', 'supported'],
		['@fusescope/browser', '0.4.2', 'supported'],
		['@fusescope/browser', '0.0.9', 'outdated'],
		['@fusescope/browser', '1.0.0', 'other'],
		['opentelemetry', '2.12.0', 'other'],
		['', '', 'unknown'],
		['@fusescope/browser', 'garbage', 'unknown'],
	])('%s %s is %s', (name, version, support) => {
		expect(sdkSupport(name, version, SUPPORTED)).toBe(support);
	});
});
