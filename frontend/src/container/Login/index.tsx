import CredentialsStep from './components/CredentialsStep';
import EmailStep from './components/EmailStep';
import { useLogin } from './useLogin';

function Login(): JSX.Element {
	const login = useLogin();
	const { sessionsContext } = login;

	if (!sessionsContext) {
		return <EmailStep {...login} />;
	}

	return <CredentialsStep {...login} sessionsContext={sessionsContext} />;
}

export default Login;
