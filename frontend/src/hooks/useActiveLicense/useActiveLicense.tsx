import { useMemo } from 'react';
import { StatusCodes } from 'http-status-codes';
import APIError from 'types/api/error';
import { LicenseResModel } from 'types/api/licensesV3/getActive';

export interface ActiveLicenseResult {
	data: LicenseResModel | undefined;
	isFetching: boolean;
	error: APIError | null;
	refetch: () => void;
}

// FuseScope has no licensing. Report the community edition the same way the
// backend's 501 did, without the request: the browser logs every failed
// request to the console, and the rest of the app keys off this status code.
export const COMMUNITY_EDITION_LICENSE_ERROR = new APIError({
	httpStatusCode: StatusCodes.NOT_IMPLEMENTED,
	error: {
		code: 'not_implemented',
		message: 'licensing is not available in FuseScope',
		url: '',
		errors: [],
	},
});

const noop = (): void => {};

const useActiveLicense = (isLoggedIn: boolean): ActiveLicenseResult =>
	useMemo(
		() => ({
			data: undefined,
			isFetching: false,
			error: isLoggedIn ? COMMUNITY_EDITION_LICENSE_ERROR : null,
			refetch: noop,
		}),
		[isLoggedIn],
	);

export default useActiveLicense;
