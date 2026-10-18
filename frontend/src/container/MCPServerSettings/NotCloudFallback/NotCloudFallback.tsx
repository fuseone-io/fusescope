import { useCallback } from 'react';
import logEvent from 'api/common/logEvent';
import LearnMore from 'components/LearnMore/LearnMore';
import Panel from 'components/PageTemplate/components/Panel';
import SettingsPageShell from 'pages/Settings/components/SettingsPageShell';

import { MCP_DOCS_URL } from '../clients';

const DOCS_LINK_EVENT = 'MCP Settings: Docs link clicked';

function NotCloudFallback(): JSX.Element {
	const handleDocsClick = useCallback(() => {
		void logEvent(DOCS_LINK_EVENT, { target: 'fallback' });
	}, []);

	return (
		<SettingsPageShell testId="mcp-not-cloud-fallback" title="MCP Server" narrow>
			<Panel
				title="MCP Server is available on FuseScope"
				subtitle="Users can follow the docs to setup the MCP server against their FuseScope instance."
				bodyClassName="tw:px-5 tw:pt-3 tw:pb-4"
			>
				<LearnMore
					text="View MCP Server docs"
					url={MCP_DOCS_URL}
					onClick={handleDocsClick}
				/>
			</Panel>
		</SettingsPageShell>
	);
}

export default NotCloudFallback;
