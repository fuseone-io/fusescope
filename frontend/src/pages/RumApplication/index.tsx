import { useState } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import HeaderBandTabsLayout from 'components/PageTemplate/components/HeaderBandTabsLayout';
import { PageTab } from 'components/PageTemplate/types';
import SoonBadge from 'components/Rum/SoonBadge';
import RumApplicationSheet from 'components/RumApplicationSheet/RumApplicationSheet';
import ROUTES from 'constants/routes';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { overviewFilter } from 'lib/rum/overviewQueries';

import ApplicationNotFound from './components/ApplicationNotFound';
import OverviewHeader from './components/OverviewHeader';
import OverviewTab from './components/OverviewTab';
import ReleaseFilter from './components/ReleaseFilter';
import { OVERVIEW_TAB } from './constants';
import { useApplicationOverview } from './hooks/useApplicationOverview';

const SOON_TABS = [
	['views', 'Views', 'Per-route load time, vitals and slow resources'],
	['errors', 'Errors', 'Errors grouped by fingerprint, with source maps'],
	['sessions', 'Sessions', 'Session list and timeline'],
];

function RumApplication(): JSX.Element {
	const { pathname } = useLocation();
	const id =
		matchPath<{ id: string }>(pathname, ROUTES.RUM_APPLICATION)?.params.id ?? '';
	const { safeNavigate } = useSafeNavigate();
	const [release, setRelease] = useState('');
	const [settingsOpen, setSettingsOpen] = useState(false);
	const state = useApplicationOverview(id, release);
	const filter = overviewFilter(id, release);

	if (state.notFound) {
		return <ApplicationNotFound />;
	}

	const tabs: PageTab[] = [
		{
			value: OVERVIEW_TAB,
			label: 'Overview',
			content: (
				<OverviewTab
					overview={state.overview}
					loading={state.overviewLoading}
					filter={filter}
					window={state.window}
					sessionErrors={state.sessionErrors}
					sessionRequests={state.sessionRequests}
				/>
			),
		},
		...SOON_TABS.map(([value, label, title]) => ({
			value,
			label,
			title,
			disabled: true,
			badge: <SoonBadge className="tw:h-[18px] tw:text-[11px]" />,
			content: null,
		})),
	];

	return (
		<>
			<HeaderBandTabsLayout
				testId="rum-application-page"
				header={
					<OverviewHeader
						application={state.application}
						release={release || state.overview.releases[0]}
						sdk={state.overview.sdk}
						support={state.sdkSupport}
						filter={filter}
						window={state.window}
						onOpenSettings={(): void => setSettingsOpen(true)}
					/>
				}
				label="Application sections"
				tabs={tabs}
				value={OVERVIEW_TAB}
				onValueChange={(): void => undefined}
				toolbar={
					<ReleaseFilter
						releases={state.overview.releases}
						value={release}
						onChange={setRelease}
					/>
				}
			/>
			<RumApplicationSheet
				target={settingsOpen ? { mode: 'edit', applicationId: id } : null}
				onClose={(): void => setSettingsOpen(false)}
				onDeleted={(): void => safeNavigate(ROUTES.RUM_APPLICATIONS)}
			/>
		</>
	);
}

export default RumApplication;
