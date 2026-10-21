import { Redirect, useLocation } from 'react-router-dom';
import CompactPageHeader from 'components/PageTemplate/components/CompactPageHeader';
import HeaderBandLayout from 'components/PageTemplate/components/HeaderBandLayout';
import { legacyDomainRedirect } from 'container/ApiMonitoring/domainRoute';
import ExplorerPage from 'container/ApiMonitoring/Explorer/Explorer';
import { Binoculars } from 'lucide-react';

import DomainsCountLine from './DomainsCountLine';

function ApiMonitoringPage(): JSX.Element {
	const { search } = useLocation();
	const legacyTarget = legacyDomainRedirect(search);

	if (legacyTarget) {
		return <Redirect to={legacyTarget} />;
	}

	return (
		<HeaderBandLayout
			testId="api-monitoring-page"
			header={
				<CompactPageHeader
					icon={<Binoculars />}
					title="External APIs"
					meta={<DomainsCountLine />}
				/>
			}
		>
			<ExplorerPage />
		</HeaderBandLayout>
	);
}

export default ApiMonitoringPage;
