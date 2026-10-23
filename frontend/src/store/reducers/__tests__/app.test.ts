import { UPDATE_LATEST_VERSION_ERROR } from 'types/actions/app';

import appReducer from '../app';

describe('appReducer', () => {
	it('starts as a community build until the version is known', () => {
		const state = appReducer(undefined, {
			type: UPDATE_LATEST_VERSION_ERROR,
			payload: { isError: true },
		});
		expect(state.ee).toBe('N');
	});
});
