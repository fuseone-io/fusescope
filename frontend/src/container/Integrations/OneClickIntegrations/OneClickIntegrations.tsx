import { useMemo } from 'react';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { IntegrationsProps } from 'types/api/integrations/types';

import CardGrid from '../components/CardGrid';
import IntegrationCard from '../components/IntegrationCard';
import IntegrationsNotFound from '../components/IntegrationsNotFound';
import SectionLabel from '../components/SectionLabel';
import { useThemedIntegrationIcon } from '../components/useThemedIntegrationIcon';
import { ONE_CLICK_INTEGRATIONS } from '../constants';

interface OneClickIntegrationsProps {
	searchQuery: string;
	setSelectedIntegration: (integration: IntegrationsProps) => void;
}

function OneClickIntegrations(props: OneClickIntegrationsProps): JSX.Element {
	const { searchQuery, setSelectedIntegration } = props;
	const themedIcon = useThemedIntegrationIcon();

	const filteredIntegrations = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		if (!query) {
			return ONE_CLICK_INTEGRATIONS;
		}

		return ONE_CLICK_INTEGRATIONS.filter(
			(integration) =>
				integration.title.toLowerCase().includes(query) ||
				integration.description.toLowerCase().includes(query),
		);
	}, [searchQuery]);

	return (
		<section className="one-click-integrations fs-ui tw:flex tw:flex-col tw:gap-4 tw:font-sans tw:text-foreground">
			<SectionLabel>One-click integrations</SectionLabel>

			<CardGrid testId="one-click-integrations-list">
				{filteredIntegrations.length === 0 && searchQuery.trim() ? (
					<IntegrationsNotFound query={searchQuery.trim()} />
				) : (
					filteredIntegrations.map((integration) => (
						<IntegrationCard
							key={integration.id}
							className="one-click-integrations-list-item"
							icon={themedIcon(integration.id, integration.icon)}
							iconAlt={integration.title}
							title={integration.title}
							description={integration.description}
							badge={
								integration.is_new && (
									<StatusBadge
										tone="info"
										className="tw:bg-brand-secondary-soft tw:text-brand-secondary-ink"
									>
										New
									</StatusBadge>
								)
							}
							onClick={(): void => setSelectedIntegration(integration)}
						/>
					))
				)}
			</CardGrid>
		</section>
	);
}

export default OneClickIntegrations;
