import { useState } from 'react';
import { generatePath, matchPath, useLocation } from 'react-router-dom';
import { RumtypesPlatformDTO } from 'api/generated/services/fuseScope.schemas';
import HeaderBandTabsLayout from 'components/PageTemplate/components/HeaderBandTabsLayout';
import { PageTab } from 'components/PageTemplate/types';
import RumApplicationSheet from 'components/RumApplicationSheet/RumApplicationSheet';
import { SheetTab } from 'components/RumApplicationSheet/types';
import ROUTES from 'constants/routes';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { overviewFilter } from 'lib/rum/overviewQueries';

import ApplicationNotFound from './components/ApplicationNotFound';
import ApplicationToolbar from './components/ApplicationToolbar';
import OverviewHeader from './components/OverviewHeader';
import OverviewTab from './components/OverviewTab';
import { ERRORS_TAB, OVERVIEW_TAB, SESSIONS_TAB, VIEWS_TAB } from './constants';
import { useApplicationOverview } from './hooks/useApplicationOverview';
import ErrorsTab from './Errors';
import ErrorDetail from './Errors/ErrorDetail';
import { useReleaseParam } from './hooks/useReleaseParam';
import SessionsTab from './Sessions';
import SessionTimeline from './SessionTimeline';
import { applicationTab, carriedSearch, detailView } from './utils';
import ViewsTab from './Views';

const TAB_ROUTES: Record<string, string> = {
	[OVERVIEW_TAB]: ROUTES.RUM_APPLICATION,
	[VIEWS_TAB]: ROUTES.RUM_APPLICATION_VIEWS,
	[ERRORS_TAB]: ROUTES.RUM_APPLICATION_ERRORS,
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
	const fingerprint = matchPath<{ fingerprint: string }>(
		pathname,
		ROUTES.RUM_APPLICATION_ERROR,
	)?.params.fingerprint;
	const tab = applicationTab(pathname);
	const { safeNavigate } = useSafeNavigate();
	const [release, setRelease] = useReleaseParam();
	const [settingsTab, setSettingsTab] = useState<SheetTab | null>(null);
	const state = useApplicationOverview(id, release);
	const filter = overviewFilter(id, release);
	const jvm = state.application?.platform === RumtypesPlatformDTO.android;

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

	const errorsContent = fingerprint ? (
		<ErrorDetail
			applicationId={id}
			fingerprint={decodeURIComponent(fingerprint)}
			release={release}
			window={state.window}
			jvm={jvm}
			onOpenSourceMaps={(): void => setSettingsTab('sourcemaps')}
		/>
	) : (
		<ErrorsTab
			applicationId={id}
			release={release}
			window={state.window}
			jvm={jvm}
		/>
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
			content: errorsContent,
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
						onOpenSettings={(): void => setSettingsTab('settings')}
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
						detail={detailView(sessionId, fingerprint)}
						releases={state.overview.releases}
						release={release}
						onReleaseChange={setRelease}
					/>
				}
			/>
			<RumApplicationSheet
				target={settingsTab ? { mode: 'edit', applicationId: id } : null}
				initialTab={settingsTab ?? undefined}
				onClose={(): void => setSettingsTab(null)}
				onDeleted={(): void => safeNavigate(ROUTES.RUM_APPLICATIONS)}
			/>
		</>
	);
}

export default RumApplication;
