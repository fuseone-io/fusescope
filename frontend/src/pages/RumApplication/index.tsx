import { useState } from 'react';
import { generatePath, matchPath, useLocation } from 'react-router-dom';
import HeaderBandTabsLayout from 'components/PageTemplate/components/HeaderBandTabsLayout';
import { PageTab } from 'components/PageTemplate/types';
import SoonBadge from 'components/Rum/SoonBadge';
import RumApplicationSheet from 'components/RumApplicationSheet/RumApplicationSheet';
import ROUTES from 'constants/routes';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { overviewFilter } from 'lib/rum/overviewQueries';

import ApplicationNotFound from './components/ApplicationNotFound';
import ApplicationToolbar from './components/ApplicationToolbar';
import OverviewHeader from './components/OverviewHeader';
import OverviewTab from './components/OverviewTab';
import { ERRORS_TAB, OVERVIEW_TAB, SESSIONS_TAB, VIEWS_TAB } from './constants';
import { useApplicationOverview } from './hooks/useApplicationOverview';
import { useReleaseParam } from './hooks/useReleaseParam';
import SessionsTab from './Sessions';
import SessionTimeline from './SessionTimeline';
import { applicationTab, carriedSearch } from './utils';
import ViewsTab from './Views';

const TAB_ROUTES: Record<string, string> = {
	[OVERVIEW_TAB]: ROUTES.RUM_APPLICATION,
	[VIEWS_TAB]: ROUTES.RUM_APPLICATION_VIEWS,
	[SESSIONS_TAB]: ROUTES.RUM_APPLICATION_SESSIONS,
};

function RumApplication(): JSX.Element {
	const { pathname, search } = useLocation();
	const id =
		matchPath<{ id: string }>(pathname, ROUTES.RUM_APPLICATION)?.params.id ?? '';
	const sessionId = matchPath<{ sessionId: string }>(
		pathname,
		ROUTES.RUM_APPLICATION_SESSION,
	)?.params.sessionId;
	const tab = applicationTab(pathname);
	const { safeNavigate } = useSafeNavigate();
	const [release, setRelease] = useReleaseParam();
	const [settingsOpen, setSettingsOpen] = useState(false);
	const state = useApplicationOverview(id, release);
	const filter = overviewFilter(id, release);

	if (state.notFound) {
		return <ApplicationNotFound />;
	}

	const sessionsContent = sessionId ? (
		<SessionTimeline
			applicationId={id}
			sessionId={decodeURIComponent(sessionId)}
			window={state.window}
		/>
	) : (
		<SessionsTab applicationId={id} release={release} window={state.window} />
	);

	const tabs: PageTab[] = [
		{
			value: OVERVIEW_TAB,
			label: 'Overview',
			content: (
				<OverviewTab
					applicationId={id}
					release={release}
					overview={state.overview}
					loading={state.overviewLoading}
					filter={filter}
					window={state.window}
					sessionErrors={state.sessionErrors}
					sessionRequests={state.sessionRequests}
				/>
			),
		},
		{
			value: VIEWS_TAB,
			label: 'Views',
			content: (
				<ViewsTab applicationId={id} release={release} window={state.window} />
			),
		},
		{
			value: ERRORS_TAB,
			label: 'Errors',
			title: 'Errors grouped by fingerprint, with source maps',
			disabled: true,
			badge: <SoonBadge className="tw:h-[18px] tw:text-[11px]" />,
			content: null,
		},
		{ value: SESSIONS_TAB, label: 'Sessions', content: sessionsContent },
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
				value={tab}
				onValueChange={(next): void =>
					safeNavigate(
						`${generatePath(TAB_ROUTES[next], { id })}${carriedSearch(search)}`,
					)
				}
				toolbar={
					<ApplicationToolbar
						applicationId={id}
						tab={tab}
						sessionView={Boolean(sessionId)}
						releases={state.overview.releases}
						release={release}
						onReleaseChange={setRelease}
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
