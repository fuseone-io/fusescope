import { Route, Switch, useLocation } from 'react-router-dom';
import ROUTES from 'constants/routes';
import { render, screen } from 'tests/test-utils';

import GetStartedRedirect from '../GetStartedRedirect';

function Location(): JSX.Element {
	const location = useLocation();
	return (
		<div data-testid="location">{`${location.pathname}${location.search}`}</div>
	);
}

describe('GetStartedRedirect', () => {
	it.each([
		['/get-started-with-signoz-cloud', '/get-started'],
		[
			'/get-started-with-signoz-cloud?q=java&goal=apps',
			'/get-started?q=java&goal=apps',
		],
	])('sends %s to %s', (from, to) => {
		render(
			<Switch>
				<Route path={ROUTES.GET_STARTED_WITH_CLOUD}>
					<GetStartedRedirect />
				</Route>
				<Route path={ROUTES.GET_STARTED}>
					<Location />
				</Route>
			</Switch>,
			undefined,
			{ initialRoute: from },
		);

		expect(screen.getByTestId('location')).toHaveTextContent(to);
	});
});
