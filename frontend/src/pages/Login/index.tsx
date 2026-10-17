import AuthLayout from 'components/AuthLayout/AuthLayout';
import LoginContainer from 'container/Login';

function Login(): JSX.Element {
	return (
		<AuthLayout>
			<LoginContainer />
		</AuthLayout>
	);
}

export default Login;
