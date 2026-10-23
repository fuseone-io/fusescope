import { ApmWindow } from 'lib/apm/window';

import SessionTimelineBody from './components/SessionTimelineBody';
import { useSessionQuery } from './hooks/useSessionQuery';

interface SessionTimelineProps {
	applicationId: string;
	sessionId: string;
	window: ApmWindow;
}

const MESSAGE =
	'tw:m-0 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:px-5 tw:py-12 tw:text-center tw:text-[13px] tw:text-muted-foreground';

function SessionTimeline({
	applicationId,
	sessionId,
	window,
}: SessionTimelineProps): JSX.Element {
	const state = useSessionQuery(applicationId, sessionId, window);
	if (state.status === 'loading') {
		return (
			<p data-testid="rum-session-loading" className={MESSAGE}>
				Loading session…
			</p>
		);
	}
	if (state.status === 'not-found') {
		return (
			<p data-testid="rum-session-not-found" className={MESSAGE}>
				No session <span className="tw:font-mono">{sessionId}</span> in this time
				range. Widen the range to find it.
			</p>
		);
	}
	if (state.status === 'error') {
		return <p className={MESSAGE}>This session could not be loaded.</p>;
	}
	return (
		<SessionTimelineBody
			key={state.session.sessionId}
			applicationId={applicationId}
			session={state.session}
			window={window}
		/>
	);
}

export default SessionTimeline;
