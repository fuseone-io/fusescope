import CompactPageHeader from 'components/PageTemplate/components/CompactPageHeader';
import HeaderBandLayout from 'components/PageTemplate/components/HeaderBandLayout';
import ResourceAttributesFilter from 'container/ResourceAttributesFilter';
import { Route } from 'lucide-react';

import ServiceMapBody from './components/ServiceMapBody';
import ServiceMapState from './components/ServiceMapState';
import { useServiceMapGraph } from './hooks/useServiceMapGraph';

const CODE = 'tw:font-mono tw:text-xs';

function ServiceMap(): JSX.Element {
	const data = useServiceMapGraph();
	let body = <ServiceMapState data={data} />;
	if (data.status === 'success' && data.graph.nodes.length > 0) {
		body = <ServiceMapBody graph={data.graph} stats={data.stats} />;
	}

	return (
		<HeaderBandLayout
			testId="service-map-page"
			header={
				<CompactPageHeader
					icon={<Route />}
					title="Service Map"
					meta={
						<>
							Built from spans whose parent is in another service (
							<code className={CODE}>CLIENT → SERVER</code>,{' '}
							<code className={CODE}>PRODUCER → CONSUMER</code>), plus{' '}
							<code className={CODE}>db.system</code> /{' '}
							<code className={CODE}>messaging.system</code>,{' '}
							<code className={CODE}>peer.service</code> and external addresses for
							dependencies without an SDK.
						</>
					}
				/>
			}
			bodyClassName="tw:gap-3 tw:px-4 tw:pt-4 tw:pb-8 tw:md:px-6"
		>
			<ResourceAttributesFilter />
			{body}
		</HeaderBandLayout>
	);
}

export default ServiceMap;
