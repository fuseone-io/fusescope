import ErrorContent from 'components/ErrorModal/components/ErrorContent';
import { Button } from 'components/ui/button';
import { fuseScopeDocsUrl } from 'constants/docs';
import { CalendarClock, ExternalLink, SearchX, ShipWheel } from 'lucide-react';

import InfraEmptyState from '../components/InfraEmptyState';
import { InfraMonitoringEntity, K8S_CATEGORY_LABELS } from '../constants';
import type { K8sBaseListEmptyStateContext } from './K8sBaseList';

type K8sEmptyStateProps = Partial<K8sBaseListEmptyStateContext> & {
	entity: InfraMonitoringEntity;
};

const KUBERNETES_DOCS_URL = fuseScopeDocsUrl('/sending-data/kubernetes/');
const HOSTS_DOCS_URL = fuseScopeDocsUrl(
	'/sending-data/kubernetes/#hosts-outside-kubernetes',
);

export function K8sEmptyState({
	entity,
	isError,
	error,
	isLoading,
	hasFilters,
	endTimeBeforeRetention,
}: K8sEmptyStateProps): JSX.Element | null {
	if (isLoading) {
		return null;
	}

	if (isError || error) {
		return (
			<div className="tw:w-full tw:max-w-3xl">
				<ErrorContent
					error={
						error ?? {
							code: 500,
							message: 'An error occurred while fetching data.',
						}
					}
				/>
			</div>
		);
	}

	if (endTimeBeforeRetention) {
		return (
			<InfraEmptyState
				icon={<CalendarClock />}
				title="Queried time range is before earliest K8s metrics"
				description="Your requested end time is earlier than the earliest detected time of K8s metrics data, please adjust your end time."
			/>
		);
	}

	if (hasFilters) {
		return (
			<InfraEmptyState
				icon={<SearchX />}
				title={`No ${K8S_CATEGORY_LABELS[entity].toLowerCase()} match this filter`}
				description="Edit the filter or widen the time range."
			/>
		);
	}

	const isHosts = entity === InfraMonitoringEntity.HOSTS;

	return (
		<InfraEmptyState
			testId="infra-onboarding"
			icon={<ShipWheel />}
			title={isHosts ? 'No host metrics yet' : 'No Kubernetes metrics yet'}
			description={
				isHosts
					? 'Host metrics come from the collector’s hostmetrics receiver, which the k8s-infra chart runs on every node. None arrived in the selected range.'
					: 'Install the k8s-infra chart to send node, pod and cluster metrics to FuseScope. None arrived in the selected range.'
			}
			actions={
				<Button asChild variant="outline" size="sm">
					<a
						href={isHosts ? HOSTS_DOCS_URL : KUBERNETES_DOCS_URL}
						target="_blank"
						rel="noopener noreferrer"
					>
						<span className="translate-safe">
							{isHosts ? 'Set up host metrics' : 'Set up Kubernetes monitoring'}
						</span>
						<ExternalLink />
					</a>
				</Button>
			}
		/>
	);
}
