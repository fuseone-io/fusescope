import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import getVersion from 'api/v1/version/get';
import get from 'api/v2/sessions/context/get';
import post from 'api/v2/sessions/email_password/post';
import afterLogin from 'AppRoutes/utils';
import { VERSION_QUERY_KEY } from 'components/AuthLayout/constants';
import ROUTES from 'constants/routes';
import useUrlQuery from 'hooks/useUrlQuery';
import history from 'lib/history';
import APIError from 'types/api/error';
import { SessionsContext } from 'types/api/v2/sessions/context/get';

import { LoginState } from './types';
import {
	callbackErrorFromParams,
	getOrgAuthN,
	isValidEmail,
	warningToError,
} from './utils';

export function useLogin(): LoginState {
	const urlQueryParams = useUrlQuery();
	const forcePassword = (urlQueryParams.get('password') || 'N') === 'Y';
	const accessToken = urlQueryParams.get('accessToken') || '';
	const refreshToken = urlQueryParams.get('refreshToken') || '';

	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [sessionsContext, setSessionsContext] = useState<SessionsContext>();
	const [orgId, setOrgId] = useState('');
	const [isContextLoading, setIsContextLoading] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<APIError | undefined>(() =>
		callbackErrorFromParams(urlQueryParams),
	);

	// setupCompleted routes a fresh install to sign up.
	const {
		data: versionData,
		isLoading: isVersionLoading,
		error: versionError,
	} = useQuery({ queryFn: getVersion, queryKey: VERSION_QUERY_KEY });

	// On a version error stay here: sign up could register a second admin.
	useEffect(() => {
		if (versionData && !versionError && !versionData.data.setupCompleted) {
			history.push(ROUTES.SIGN_UP);
		}
	}, [versionData, versionError]);

	// The callback authN redirects back here with the session tokens.
	useEffect(() => {
		if (accessToken && refreshToken) {
			afterLogin(accessToken, refreshToken);
		}
	}, [accessToken, refreshToken]);

	const selectedOrg = useMemo(
		() => sessionsContext?.orgs.find((org) => org.id === orgId),
		[sessionsContext, orgId],
	);
	const authN = useMemo(
		() => getOrgAuthN(selectedOrg, forcePassword),
		[selectedOrg, forcePassword],
	);
	const warning = useMemo(
		() =>
			selectedOrg?.warning ? warningToError(selectedOrg.warning) : undefined,
		[selectedOrg],
	);

	const onContinue = useCallback(async (): Promise<void> => {
		setIsContextLoading(true);
		setError(undefined);

		try {
			const { data } = await get({ email, ref: window.location.href });
			setSessionsContext(data);
			if (data.orgs.length === 1) {
				setOrgId(data.orgs[0].id);
			}
		} catch (contextError) {
			setError(contextError as APIError);
		}
		setIsContextLoading(false);
	}, [email]);

	const onChangeEmail = useCallback((): void => {
		setSessionsContext(undefined);
		setOrgId('');
		setPassword('');
		setError(undefined);
	}, []);

	const selectOrg = useCallback((id: string): void => {
		setOrgId(id);
		setError(undefined);
	}, []);

	const onPasswordSignIn = useCallback(async (): Promise<void> => {
		setIsSubmitting(true);
		setError(undefined);

		try {
			const { data } = await post({ email, password, orgId });
			afterLogin(data.accessToken, data.refreshToken);
		} catch (signInError) {
			setError(signInError as APIError);
		} finally {
			setIsSubmitting(false);
		}
	}, [email, password, orgId]);

	const onSingleSignOn = useCallback((): void => {
		if (authN.callbackUrl) {
			// oxlint-disable-next-line signoz/no-raw-absolute-path
			window.location.href = authN.callbackUrl;
		}
	}, [authN.callbackUrl]);

	const onForgotPassword = useCallback((): void => {
		if (!email || !sessionsContext?.orgs?.length) {
			return;
		}

		history.push(ROUTES.FORGOT_PASSWORD, {
			email,
			orgId,
			orgs: sessionsContext.orgs,
		});
	}, [email, orgId, sessionsContext]);

	return {
		email,
		setEmail,
		password,
		setPassword,
		isEmailValid: isValidEmail(email),
		isVersionLoading,
		isContextLoading,
		isSubmitting,
		sessionsContext,
		selectedOrg,
		selectOrg,
		authN,
		error: error ?? warning,
		onContinue,
		onChangeEmail,
		onPasswordSignIn,
		onSingleSignOn,
		onForgotPassword,
	};
}
