import PageTabs from 'components/PageTemplate/components/PageTabs';
import Panel from 'components/PageTemplate/components/Panel';
import { PageTab } from 'components/PageTemplate/types';
import { Database, Info, Wrench } from 'lucide-react';
import { IntegrationDetailedProps } from 'types/api/integrations/types';

import Configure from './IntegrationDetailContentTabs/Configure';
import DataCollected from './IntegrationDetailContentTabs/DataCollected';
import Overview from './IntegrationDetailContentTabs/Overview';

interface IntegrationDetailContentProps {
	activeDetailTab: string;
	integrationData: IntegrationDetailedProps;
	integrationId: string;
	setActiveDetailTab: React.Dispatch<React.SetStateAction<string | null>>;
}

const TAB_ICON_CLASS = 'tw:size-4';
/** The tab bodies are legacy markdown and antd tables laid out for antd's line height. */
const PANEL_BODY_CLASS = 'tw:p-5 tw:leading-[1.5715]';

function IntegrationDetailContent(
	props: IntegrationDetailContentProps,
): JSX.Element {
	const { activeDetailTab, integrationData, integrationId, setActiveDetailTab } =
		props;

	const tabs: PageTab[] = [
		{
			value: 'overview',
			label: (
				<>
					<Info aria-hidden="true" className={TAB_ICON_CLASS} />
					Overview
				</>
			),
			content: (
				<Panel testId="integration-overview" bodyClassName={PANEL_BODY_CLASS}>
					<Overview
						categories={integrationData.categories}
						assets={integrationData.assets}
						overviewContent={integrationData.overview}
					/>
				</Panel>
			),
		},
		{
			value: 'configuration',
			label: (
				<>
					<Wrench aria-hidden="true" className={TAB_ICON_CLASS} />
					Configure
				</>
			),
			content: (
				<Panel testId="integration-configure" bodyClassName={PANEL_BODY_CLASS}>
					<Configure
						configuration={integrationData.configuration}
						integrationId={integrationId}
					/>
				</Panel>
			),
		},
		{
			value: 'dataCollected',
			label: (
				<>
					<Database aria-hidden="true" className={TAB_ICON_CLASS} />
					Data Collected
				</>
			),
			content: (
				<Panel testId="integration-data-collected" bodyClassName={PANEL_BODY_CLASS}>
					<DataCollected
						logsData={integrationData.data_collected.logs}
						metricsData={integrationData.data_collected.metrics}
					/>
				</Panel>
			),
		},
	];

	return (
		<PageTabs
			label="Integration details"
			tabs={tabs}
			value={activeDetailTab}
			onValueChange={setActiveDetailTab}
		/>
	);
}

export default IntegrationDetailContent;
