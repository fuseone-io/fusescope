import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import AuthLayout from 'components/AuthLayout/AuthLayout';
import ROUTES from 'constants/routes';
import ForgotPasswordContainer, {
	ForgotPasswordRouteState,
} from 'container/ForgotPassword';
import history from 'lib/history';

function ForgotPassword(): JSX.Element | null {
	const location = useLocation<ForgotPasswordRouteState | undefined>();
	const routeState = location.state;

	useEffect(() => {
		if (!routeState?.email) {
			history.push(ROUTES.LOGIN);
		}
	}, [routeState]);

	if (!routeState?.email) {
		return null;
	}

	return (
		<AuthLayout>
			<ForgotPasswordContainer
				email={routeState.email}
				orgId={routeState.orgId}
				orgs={routeState.orgs}
			/>
		</AuthLayout>
	);
}

export default ForgotPassword;
