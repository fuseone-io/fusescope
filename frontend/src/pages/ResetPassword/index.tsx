import { useEffect, useMemo } from 'react';
import { useQuery } from 'react-query';
import { useLocation } from 'react-use';
import { AxiosError } from 'axios';
import { convertToApiError } from 'api/ErrorResponseHandlerForGeneratedAPIs';
import { verifyResetPasswordToken } from 'api/generated/services/users';
import { RenderErrorResponseDTO } from 'api/generated/services/fuseScope.schemas';
import { Logout } from 'api/utils';
import Spinner from 'components/Spinner';
import ResetPasswordContainer from 'container/ResetPassword';
import TokenError from 'container/ResetPassword/TokenError';
import ROUTES from 'constants/routes';
import history from 'lib/history';

function ResetPassword(): JSX.Element {
	const { search } = useLocation();
	const params = new URLSearchParams(search || '');
	const token = params.get('token') || '';

	useEffect(() => {
		if (!token) {
			void Logout();
			history.push(ROUTES.LOGIN);
		}
	}, [token]);

	const {
		isLoading: isVerifying,
		isError: isTokenError,
		error: tokenError,
	} = useQuery<
		Awaited<ReturnType<typeof verifyResetPasswordToken>>,
		AxiosError<RenderErrorResponseDTO>
	>({
		queryFn: () => verifyResetPasswordToken({ token }),
		queryKey: ['verifyResetPasswordToken', token],
		enabled: !!token,
		retry: false,
	});

	const tokenApiError = useMemo(
		() => convertToApiError(tokenError),
		[tokenError],
	);

	if (!token) {
		return <Spinner tip="Loading..." />;
	}

	if (isVerifying) {
		return <Spinner tip="Validating your reset password token..." />;
	}

	if (isTokenError) {
		return <TokenError error={tokenApiError} />;
	}

	return <ResetPasswordContainer />;
}

export default ResetPassword;
