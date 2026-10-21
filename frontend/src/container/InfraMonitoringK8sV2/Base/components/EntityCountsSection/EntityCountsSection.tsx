import { Link } from 'react-router-dom';
import KpiStrip from 'components/PageTemplate/components/KpiStrip';
import Stat from 'components/PageTemplate/components/Stat';
import { ChevronRight } from 'lucide-react';

import { InfraMonitoringEntity } from '../../../constants';
import { getDrawerDurationMs } from '../../useDrawerLifecycleStore';
import { buildK8sListNavigationUrl } from '../../utils';
import { logInfraExplorerNavigatedEvent } from 'container/InfraMonitoringK8sV2/Base/events';

export interface EntityCountConfig<T> {
	label: string;
	getValue: (entity: T) => number;
	targetCategory: InfraMonitoringEntity;
}

interface EntityCountsSectionProps<T> {
	entity: T;
	countsConfig: EntityCountConfig<T>[];
	selectedItem: string;
	filterExpression: string;
	closeDrawer: () => void;
	entityType: InfraMonitoringEntity;
	activeTab: string;
}

export function EntityCountsSection<T>({
	entity,
	countsConfig,
	selectedItem,
	filterExpression,
	closeDrawer,
	entityType,
	activeTab,
}: EntityCountsSectionProps<T>): JSX.Element {
	const handleCardNavigate = (cardLabel: string): void => {
		logInfraExplorerNavigatedEvent({
			entityType,
			destination: 'k8s_list',
			source: 'stats_card',
			tab: activeTab,
			sourceKey: cardLabel,
			drawerDurationMsAtNavigation: getDrawerDurationMs(),
		});
		closeDrawer();
	};

	return (
		<KpiStrip
			label="Related resources"
			testId="entity-counts"
			className="tw:rounded-xl"
		>
			{countsConfig.map((config) => {
				const slug = config.label.toLowerCase().replace(/\s+/g, '-');
				const value = config.getValue(entity);
				return (
					<Stat
						key={config.label}
						testId={`count-card-${slug}`}
						label={config.label}
						value={value || '—'}
						note={
							<Link
								to={buildK8sListNavigationUrl(config.targetCategory, filterExpression)}
								onClick={(): void => handleCardNavigate(config.label)}
								data-testid={`navigate-${slug}`}
								title={`View ${config.label.toLowerCase()} of '${selectedItem}'`}
								className="tw:inline-flex tw:items-center tw:gap-0.5 tw:text-xs tw:text-primary-ink! tw:hover:underline"
							>
								View {config.label.toLowerCase()}
								<ChevronRight size={12} aria-hidden="true" />
							</Link>
						}
					/>
				);
			})}
		</KpiStrip>
	);
}
