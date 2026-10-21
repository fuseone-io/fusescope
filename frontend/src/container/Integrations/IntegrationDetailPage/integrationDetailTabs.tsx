import { ReactNode } from 'react';
import { PageTab } from 'components/PageTemplate/types';
import { Database, Info, Wrench } from 'lucide-react';
import { IntegrationDetailedProps } from 'types/api/integrations/types';

import Configure from './IntegrationDetailContentTabs/Configure';
import DataCollected from './IntegrationDetailContentTabs/DataCollected';
import Overview from './IntegrationDetailContentTabs/Overview';

const TAB_ICON_CLASS = 'tw:size-4';

interface IntegrationDetailTabsOptions {
	integrationData: IntegrationDetailedProps | undefined;
	integrationId: string;
	/** Shown in place of each tab's content: the loading skeleton. */
	placeholder?: ReactNode;
	/** Under each tab's content: the uninstall bar. */
	footer?: ReactNode;
}

function withFooter(content: ReactNode, footer: ReactNode): ReactNode {
	return (
		<div className="tw:flex tw:flex-col tw:gap-4">
			{content}
			{footer}
		</div>
	);
}

/** Overview, Configure and Data Collected, each with its icon. */
export function integrationDetailTabs({
	integrationData,
	integrationId,
	placeholder,
	footer,
}: IntegrationDetailTabsOptions): PageTab[] {
	const body = (
		render: (data: IntegrationDetailedProps) => ReactNode,
	): ReactNode =>
		placeholder || !integrationData
			? placeholder
			: withFooter(render(integrationData), footer);

	return [
		{
			value: 'overview',
			label: (
				<>
					<Info aria-hidden="true" className={TAB_ICON_CLASS} />
					Overview
				</>
			),
			content: body((data) => (
				<Overview
					categories={data.categories}
					assets={data.assets}
					overviewContent={data.overview}
					authorName={data.author?.name}
				/>
			)),
		},
		{
			value: 'configuration',
			label: (
				<>
					<Wrench aria-hidden="true" className={TAB_ICON_CLASS} />
					Configure
				</>
			),
			content: body((data) => (
				<Configure
					configuration={data.configuration}
					integrationId={integrationId}
				/>
			)),
		},
		{
			value: 'dataCollected',
			label: (
				<>
					<Database aria-hidden="true" className={TAB_ICON_CLASS} />
					Data Collected
				</>
			),
			content: body((data) => (
				<DataCollected
					logsData={data.data_collected.logs}
					metricsData={data.data_collected.metrics}
				/>
			)),
		},
	];
}
