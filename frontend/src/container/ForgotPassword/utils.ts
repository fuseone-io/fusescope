import { StatusCodes } from 'http-status-codes';
import APIError from 'types/api/error';

/** The backend answers `unsupported` while `user.password.reset.allow_self` is off. */
export const isSelfServiceResetDisabled = (error?: APIError): boolean =>
	!!error &&
	(error.getErrorCode() === 'unsupported' ||
		error.getHttpStatusCode() === StatusCodes.NOT_IMPLEMENTED);
