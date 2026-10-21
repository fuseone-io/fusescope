import { useEffect } from 'react';
import * as Sentry from '@sentry/react';
import logEvent from 'api/common/logEvent';
import ErrorBoundaryFallback from 'pages/ErrorBoundaryFallback/ErrorBoundaryFallback';

import DomainList from './Domains/DomainList';

function Explorer(): JSX.Element {
	useEffect(() => {
		logEvent('API Monitoring: Landing page visited', {});
	}, []);

	return (
		<Sentry.ErrorBoundary fallback={<ErrorBoundaryFallback />}>
			<DomainList />
		</Sentry.ErrorBoundary>
	);
}

export default Explorer;
