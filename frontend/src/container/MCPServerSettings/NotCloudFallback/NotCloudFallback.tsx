import Panel from 'components/PageTemplate/components/Panel';
import SettingsPageShell from 'pages/Settings/components/SettingsPageShell';

function NotCloudFallback(): JSX.Element {
	return (
		<SettingsPageShell testId="mcp-not-cloud-fallback" title="MCP Server" narrow>
			<Panel
				title="MCP Server is available on FuseScope"
				subtitle="Users can set up the MCP server against their FuseScope instance."
				bodyClassName="tw:pb-4"
			>
				{null}
			</Panel>
		</SettingsPageShell>
	);
}

export default NotCloudFallback;
