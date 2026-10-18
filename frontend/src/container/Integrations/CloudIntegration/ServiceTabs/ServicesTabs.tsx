import Panel from 'components/PageTemplate/components/Panel';
import { IntegrationType } from 'container/Integrations/types';
import useUrlQuery from 'hooks/useUrlQuery';

import ServiceDetails from '../AmazonWebServices/ServiceDetails/ServiceDetails';
import ServicesList from '../ServicesList';

function ServicesTabs({ type }: { type: IntegrationType }): JSX.Element {
	const urlQuery = useUrlQuery();
	const cloudAccountId = urlQuery.get('cloudAccountId') || '';

	return (
		<Panel
			testId="cloud-integration-services"
			className="tw:overflow-hidden"
			bodyClassName="tw:flex tw:flex-col tw:md:flex-row"
		>
			<div className="tw:flex-none tw:border-b tw:border-border tw:md:w-60 tw:md:border-r tw:md:border-b-0">
				<ServicesList cloudAccountId={cloudAccountId} type={type} />
			</div>
			<div className="tw:min-w-0 tw:flex-1 tw:p-5 tw:leading-[1.5715]">
				<ServiceDetails type={type} />
			</div>
		</Panel>
	);
}

export default ServicesTabs;
