import CompactPageHeader from 'components/PageTemplate/components/CompactPageHeader';
import HeaderBandLayout from 'components/PageTemplate/components/HeaderBandLayout';
import ExplorerPage from 'container/ApiMonitoring/Explorer/Explorer';
import { Binoculars } from 'lucide-react';

function ApiMonitoringPage(): JSX.Element {
	return (
		<HeaderBandLayout
			bounded
			testId="api-monitoring-page"
			header={<CompactPageHeader icon={<Binoculars />} title="External APIs" />}
		>
			<ExplorerPage />
		</HeaderBandLayout>
	);
}

export default ApiMonitoringPage;
