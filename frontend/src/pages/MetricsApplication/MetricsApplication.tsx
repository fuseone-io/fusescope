import { useParams } from 'react-router-dom';
import CompactPageHeader from 'components/PageTemplate/components/CompactPageHeader';
import HeaderBandTabsLayout from 'components/PageTemplate/components/HeaderBandTabsLayout';
import { useQueryParamTab } from 'components/PageTemplate/hooks/useQueryParamTab';
import { PageTab } from 'components/PageTemplate/types';
import { QueryParams } from 'constants/query';
import DBCall from 'container/MetricsApplication/Tabs/DBCall';
import External from 'container/MetricsApplication/Tabs/External';
import Overview from 'container/MetricsApplication/Tabs/Overview';
import { useServiceKinds } from 'lib/apm/useServiceKinds';
import {
	Boxes,
	Bug,
	Database,
	ExternalLink,
	LayoutDashboard,
	ListTree,
	LucideIcon,
	Workflow,
} from 'lucide-react';

import ServiceHeaderActions from './components/ServiceHeaderActions';
import ServiceHeaderMeta from './components/ServiceHeaderMeta';
import ServiceToolbar from './components/ServiceToolbar';
import { useComparePreviousPeriod } from './hooks/useComparePreviousPeriod';
import Dependencies from './tabs/Dependencies/Dependencies';
import Endpoints from './tabs/Endpoints/Endpoints';
import Errors from './tabs/Errors/Errors';
import Infrastructure from './tabs/Infrastructure/Infrastructure';
import { MetricsApplicationTab, TAB_KEY_VS_LABEL } from './types';

const TABS = Object.values(MetricsApplicationTab);

const TAB_ICON: Record<MetricsApplicationTab, LucideIcon> = {
	[MetricsApplicationTab.OVER_METRICS]: LayoutDashboard,
	[MetricsApplicationTab.ENDPOINTS]: ListTree,
	[MetricsApplicationTab.DEPENDENCIES]: Workflow,
	[MetricsApplicationTab.ERRORS]: Bug,
	[MetricsApplicationTab.INFRASTRUCTURE]: Boxes,
	[MetricsApplicationTab.DB_CALL_METRICS]: Database,
	[MetricsApplicationTab.EXTERNAL_METRICS]: ExternalLink,
};

function tabLabel(tab: MetricsApplicationTab): JSX.Element {
	const Icon = TAB_ICON[tab];
	return (
		<>
			<Icon aria-hidden="true" className="tw:size-4" />
			{TAB_KEY_VS_LABEL[tab]}
		</>
	);
}

function MetricsApplication(): JSX.Element {
	const { servicename: encodedServiceName } = useParams<{
		servicename: string;
	}>();
	const servicename = decodeURIComponent(encodedServiceName);
	const [compare, setCompare] = useComparePreviousPeriod();
	const KindIcon = useServiceKinds()(servicename).kind.icon;

	const [activeTab, setActiveTab] = useQueryParamTab({
		param: QueryParams.tab,
		values: TABS,
		fallback: MetricsApplicationTab.OVER_METRICS,
	});
	const open = (tab: MetricsApplicationTab) => (): void => setActiveTab(tab);

	const content: Record<MetricsApplicationTab, JSX.Element> = {
		[MetricsApplicationTab.OVER_METRICS]: (
			<Overview
				compare={compare}
				onOpenEndpoints={open(MetricsApplicationTab.ENDPOINTS)}
				onOpenDependencies={open(MetricsApplicationTab.DEPENDENCIES)}
			/>
		),
		[MetricsApplicationTab.ENDPOINTS]: <Endpoints servicename={servicename} />,
		[MetricsApplicationTab.DEPENDENCIES]: (
			<Dependencies servicename={servicename} />
		),
		[MetricsApplicationTab.ERRORS]: <Errors servicename={servicename} />,
		[MetricsApplicationTab.INFRASTRUCTURE]: (
			<Infrastructure servicename={servicename} />
		),
		[MetricsApplicationTab.DB_CALL_METRICS]: (
			<DBCall onOpenDependencies={open(MetricsApplicationTab.DEPENDENCIES)} />
		),
		[MetricsApplicationTab.EXTERNAL_METRICS]: <External />,
	};

	const tabs: PageTab[] = TABS.map((tab) => ({
		value: tab,
		label: tabLabel(tab),
		content: content[tab],
	}));

	return (
		<HeaderBandTabsLayout
			testId="service-page"
			header={
				<CompactPageHeader
					icon={<KindIcon />}
					title={servicename}
					titleMono
					meta={
						<ServiceHeaderMeta
							servicename={servicename}
							onOpenInfrastructure={open(MetricsApplicationTab.INFRASTRUCTURE)}
						/>
					}
					actions={<ServiceHeaderActions servicename={servicename} />}
				/>
			}
			label="Service sections"
			tabs={tabs}
			value={activeTab}
			onValueChange={setActiveTab}
			toolbar={
				<ServiceToolbar
					compare={
						activeTab === MetricsApplicationTab.OVER_METRICS
							? { value: compare, onChange: setCompare }
							: undefined
					}
				/>
			}
		/>
	);
}

export default MetricsApplication;
