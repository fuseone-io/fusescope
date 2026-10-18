import PageTemplate from 'components/PageTemplate/PageTemplate';
import { IntegrationType } from 'container/Integrations/types';

import BackToIntegrations from '../components/BackToIntegrations';
import Header from './Header/Header';
import ServicesTabs from './ServiceTabs/ServicesTabs';

const CloudIntegration = ({ type }: { type: IntegrationType }): JSX.Element => {
	return (
		<PageTemplate testId="cloud-integration-page">
			<BackToIntegrations />
			<Header type={type} />
			<ServicesTabs type={type} />
		</PageTemplate>
	);
};

export default CloudIntegration;
