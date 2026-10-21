import { Button } from 'components/ui/button';
import { fuseScopeDocsUrl } from 'constants/docs';
import { ExternalLink, History } from 'lucide-react';

import InfraEmptyState from '../../components/InfraEmptyState';

const K8S_EVENTS_DOCS_URL = fuseScopeDocsUrl(
	'/sending-data/kubernetes/#kubernetes-events',
);

export default function EventsNotConfigured(): JSX.Element {
	return (
		<InfraEmptyState
			icon={<History />}
			title="No Kubernetes events received yet."
			description="To view events, enable the k8s events receiver in your OpenTelemetry Collector."
			actions={
				<Button asChild variant="outline" size="sm">
					<a href={K8S_EVENTS_DOCS_URL} target="_blank" rel="noopener noreferrer">
						Learn how to configure
						<ExternalLink />
					</a>
				</Button>
			}
		/>
	);
}
