import { useParams } from 'react-router-dom';
import PageHeader from 'components/PageTemplate/components/PageHeader';
import PageTabs from 'components/PageTemplate/components/PageTabs';
import { useQueryParamTab } from 'components/PageTemplate/hooks/useQueryParamTab';
import PageTemplate from 'components/PageTemplate/PageTemplate';
import { PageTab } from 'components/PageTemplate/types';
import { QueryParams } from 'constants/query';
import DBCall from 'container/MetricsApplication/Tabs/DBCall';
import External from 'container/MetricsApplication/Tabs/External';
import Overview from 'container/MetricsApplication/Tabs/Overview';
import ResourceAttributesFilter from 'container/ResourceAttributesFilter';
import { Server } from 'lucide-react';

import ServiceHeaderActions from './components/ServiceHeaderActions';
import { MetricsApplicationTab, TAB_KEY_VS_LABEL } from './types';

const TABS = Object.values(MetricsApplicationTab);

function MetricsApplication(): JSX.Element {
	const { servicename: encodedServiceName } = useParams<{
		servicename: string;
	}>();
	const servicename = decodeURIComponent(encodedServiceName);

	const [activeTab, setActiveTab] = useQueryParamTab({
		param: QueryParams.tab,
		values: TABS,
		fallback: MetricsApplicationTab.OVER_METRICS,
	});

	const tabs: PageTab[] = [
		{
			value: MetricsApplicationTab.OVER_METRICS,
			label: TAB_KEY_VS_LABEL[MetricsApplicationTab.OVER_METRICS],
			content: <Overview />,
		},
		{
			value: MetricsApplicationTab.DB_CALL_METRICS,
			label: TAB_KEY_VS_LABEL[MetricsApplicationTab.DB_CALL_METRICS],
			content: <DBCall />,
		},
		{
			value: MetricsApplicationTab.EXTERNAL_METRICS,
			label: TAB_KEY_VS_LABEL[MetricsApplicationTab.EXTERNAL_METRICS],
			content: <External />,
		},
	];

	return (
		<PageTemplate testId="service-page">
			<PageHeader
				icon={<Server />}
				title={servicename}
				titleMono
				actions={<ServiceHeaderActions servicename={servicename} />}
			/>
			<ResourceAttributesFilter />
			<PageTabs
				label="Service sections"
				tabs={tabs}
				value={activeTab}
				onValueChange={setActiveTab}
			/>
		</PageTemplate>
	);
}

export default MetricsApplication;
