import ROUTES from 'constants/routes';

import { contentPadding } from '../contentPadding';

describe('contentPadding', () => {
	it('pads the Summary and Volume Control tabs', () => {
		expect(contentPadding(ROUTES.METRICS_EXPLORER)).toBe(
			'tw:px-4 tw:py-4 tw:md:px-6',
		);
		expect(contentPadding(ROUTES.METRICS_EXPLORER_VOLUME_CONTROL)).toBe(
			'tw:px-4 tw:py-4 tw:md:px-6',
		);
	});

	it('leaves the Explorer full-bleed and Views to the shared page, as in Logs and Traces', () => {
		expect(contentPadding(ROUTES.METRICS_EXPLORER_EXPLORER)).toBeUndefined();
		expect(contentPadding(ROUTES.METRICS_EXPLORER_VIEWS)).toBeUndefined();
	});
});
