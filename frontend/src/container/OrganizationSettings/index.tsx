import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import SettingsPageShell from 'pages/Settings/components/SettingsPageShell';
import { useAppContext } from 'providers/App/App';

import AuthDomain from './AuthDomain';
import DisplayName from './DisplayName';

function OrganizationSettings(): JSX.Element {
	const { org } = useAppContext();

	if (!org) {
		return <div />;
	}

	return (
		<SettingsPageShell
			testId="organization-settings"
			title="Single Sign-on"
			description="Your organization's display name and the domains that sign in through SSO."
		>
			<ContentPanel
				title="Organization"
				divided
				bodyClassName="tw:flex tw:flex-col tw:gap-4 tw:px-5 tw:py-4"
			>
				{org.map((e, index) => (
					<DisplayName key={e.id} id={e.id} index={index} />
				))}
			</ContentPanel>

			<AuthDomain />
		</SettingsPageShell>
	);
}

export default OrganizationSettings;
