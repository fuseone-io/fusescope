import { useMemo } from 'react';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { Skeleton } from 'components/ui/skeleton';
import { useGetAllIntegrations } from 'hooks/Integrations/useGetAllIntegrations';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { IntegrationsProps } from 'types/api/integrations/types';

import CardGrid from '../components/CardGrid';
import IntegrationCard from '../components/IntegrationCard';
import IntegrationsNotFound from '../components/IntegrationsNotFound';
import SectionLabel from '../components/SectionLabel';
import UpdateAvailableBadge from '../components/UpdateAvailableBadge';
import { availableUpdate, handleContactSupport } from '../utils';
import IntegrationsError from '../components/IntegrationsError';

const SKELETON_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'];

interface IntegrationsListProps {
	searchQuery: string;
	setSelectedIntegration: (integration: IntegrationsProps) => void;
}

function IntegrationsList(props: IntegrationsListProps): JSX.Element {
	const { searchQuery, setSelectedIntegration } = props;

	const { data, isFetching, isLoading, isRefetching, isError, refetch } =
		useGetAllIntegrations();

	const { isCloudUser: isCloudUserVal } = useGetTenantLicense();

	const integrationsList = useMemo(() => {
		if (!data?.data.data.integrations) {
			return [];
		}
		const integrations = data.data.data.integrations;
		const query = searchQuery.trim().toLowerCase();
		if (!query) {
			return integrations;
		}
		return integrations.filter(
			(integration) =>
				integration.title.toLowerCase().includes(query) ||
				integration.description.toLowerCase().includes(query),
		);
	}, [data?.data.data.integrations, searchQuery]);

	const loading = isLoading || isFetching || isRefetching;

	return (
		<section className="integrations-list-container fs-ui tw:flex tw:flex-col tw:gap-4 tw:font-sans tw:text-foreground">
			<SectionLabel>All integrations</SectionLabel>

			{!loading && isError && (
				<IntegrationsError
					testId="integrations-list-error"
					onRetry={(): void => {
						void refetch();
					}}
					onContactSupport={(): void => handleContactSupport(isCloudUserVal)}
				/>
			)}

			{loading && (
				<CardGrid testId="integrations-list-loading">
					{SKELETON_KEYS.map((key) => (
						<Skeleton key={key} className="tw:h-[124px] tw:rounded-xl tw:bg-muted" />
					))}
				</CardGrid>
			)}

			{!loading && integrationsList.length === 0 && searchQuery.trim() && (
				<IntegrationsNotFound query={searchQuery.trim()} />
			)}

			{!loading && integrationsList.length > 0 && (
				<CardGrid testId="integrations-list">
					{integrationsList.map((integration) => {
						const update = availableUpdate(
							integration.is_installed,
							integration.version,
							integration.latest_version,
						);
						return (
							<IntegrationCard
								key={integration.id}
								className="integrations-list-item"
								icon={integration.icon}
								iconAlt={integration.title}
								title={integration.title}
								subtitle="by FuseScope"
								description={integration.description}
								footer={
									<span className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
										<StatusBadge
											dot
											tone={integration.is_installed ? 'success' : 'neutral'}
										>
											{integration.is_installed ? 'Installed' : 'Not Installed'}
										</StatusBadge>
										{update && <UpdateAvailableBadge update={update} />}
									</span>
								}
								onClick={(): void => setSelectedIntegration(integration)}
							/>
						);
					})}
				</CardGrid>
			)}
		</section>
	);
}

export default IntegrationsList;
