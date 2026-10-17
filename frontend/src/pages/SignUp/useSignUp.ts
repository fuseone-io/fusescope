import { useState } from 'react';
import logEvent from 'api/common/logEvent';
import signUpApi from 'api/v1/register/post';
import passwordAuthNContext from 'api/v2/sessions/email_password/post';
import afterLogin from 'AppRoutes/utils';
import { useNotifications } from 'hooks/useNotifications';
import APIError from 'types/api/error';

interface SignUpValues {
	email: string;
	password: string;
}

interface SignUpState {
	loading: boolean;
	formError?: APIError;
	submit: (values: SignUpValues) => Promise<void>;
}

export function useSignUp(): SignUpState {
	const [loading, setLoading] = useState(false);
	const [formError, setFormError] = useState<APIError>();
	const { notifications } = useNotifications();

	const submit = async ({ email, password }: SignUpValues): Promise<void> => {
		setLoading(true);
		setFormError(undefined);

		try {
			const user = await signUpApi({ email, password, orgDisplayName: '' });
			const token = await passwordAuthNContext({
				email,
				password,
				orgId: user.data.orgId,
			});
			void logEvent('Account Created Successfully', { email });
			afterLogin(token.data.accessToken, token.data.refreshToken);
		} catch (error) {
			if (error instanceof APIError) {
				setFormError(error);
			} else {
				notifications.error({ message: 'Something went wrong' });
			}
		} finally {
			setLoading(false);
		}
	};

	return { loading, formError, submit };
}
