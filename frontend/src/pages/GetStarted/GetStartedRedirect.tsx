import { Redirect, useLocation } from 'react-router-dom';
import ROUTES from 'constants/routes';

/** /get-started-with-signoz-cloud moved to /get-started; links keep their query. */
function GetStartedRedirect(): JSX.Element {
	const { search } = useLocation();
	return <Redirect to={{ pathname: ROUTES.GET_STARTED, search }} />;
}

export default GetStartedRedirect;
