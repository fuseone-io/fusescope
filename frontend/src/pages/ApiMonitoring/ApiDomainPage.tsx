import { useParams } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { readDomainParam } from 'container/ApiMonitoring/domainRoute';
import DomainDetails from 'container/ApiMonitoring/Explorer/Domains/DomainDetails/DomainDetails';
import ErrorBoundaryFallback from 'pages/ErrorBoundaryFallback/ErrorBoundaryFallback';

function ApiDomainPage(): JSX.Element {
	const { domain } = useParams<{ domain: string }>();
	const domainName = readDomainParam(domain);

	return (
		<Sentry.ErrorBoundary fallback={<ErrorBoundaryFallback />}>
			<DomainDetails key={domainName} domain={domainName} />
		</Sentry.ErrorBoundary>
	);
}

export default ApiDomainPage;
