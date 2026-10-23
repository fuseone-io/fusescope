import { useLocation } from 'react-router-dom';
import type { RumtypesGettableErrorGroupDTO } from 'api/generated/services/fuseScope.schemas';
import { ApmWindow } from 'lib/apm/window';
import { logsExplorerUrl, rumSessionUrl } from 'lib/rum/links';
import { overviewFilter } from 'lib/rum/overviewQueries';
import { useRumAlertUrl } from 'lib/rum/useRumAlertUrl';

import { carriedSearch, errorLogsFilter } from '../../../utils';
import { useEventParam } from '../hooks/useEventParam';
import { useSessionTotal } from '../hooks/useSessionTotal';
import { breadcrumbItems, eventPosition } from '../utils';
import AffectedSessions from './AffectedSessions';
import Breadcrumbs from './Breadcrumbs';
import ErrorDetailHeader from './ErrorDetailHeader';
import ErrorKpis from './ErrorKpis';
import LinkedRequest from './LinkedRequest';
import StackTrace from './StackTrace';

interface ErrorDetailBodyProps {
	applicationId: string;
	group: RumtypesGettableErrorGroupDTO;
	release: string;
	window: ApmWindow;
	onOpenSourceMaps: () => void;
}

function ErrorDetailBody({
	applicationId,
	group,
	release,
	window,
	onOpenSourceMaps,
}: ErrorDetailBodyProps): JSX.Element {
	const { search } = useLocation();
	const [, setEventId] = useEventParam();
	const totalSessions = useSessionTotal(applicationId, window, release);
	const events = group.latestEvents ?? [];
	const position = eventPosition(events, group.selectedEventId);
	const event = events[position.index];
	const sessionUrl = (sessionId: string): string =>
		`${rumSessionUrl(applicationId, sessionId)}${carriedSearch(search)}`;
	const logsUrl = logsExplorerUrl(
		errorLogsFilter(overviewFilter(applicationId, release), group),
		window,
	);
	const alertUrl = useRumAlertUrl('js_error_count', {
		applicationId,
		error: { type: group.type, message: group.message },
	});

	return (
		<section
			data-testid="rum-error-detail"
			aria-labelledby="rum-error-type"
			className="fs-ui tw:flex tw:min-w-0 tw:flex-col tw:overflow-hidden tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:font-sans tw:text-foreground"
		>
			<ErrorDetailHeader
				group={group}
				position={position}
				onSelectEvent={setEventId}
				logsUrl={logsUrl}
				alertUrl={alertUrl}
				sessionUrl={event ? sessionUrl(event.sessionId) : undefined}
			/>
			<ErrorKpis group={group} totalSessions={totalSessions} />
			{event ? (
				<>
					<div className="tw:flex tw:flex-wrap tw:items-stretch">
						<StackTrace
							key={event.id}
							applicationId={applicationId}
							event={event}
							onOpenSourceMaps={onOpenSourceMaps}
						/>
						<Breadcrumbs
							items={breadcrumbItems(group.breadcrumbs, event, group.fingerprint)}
							errorAt={event.timestamp}
							sessionId={event.sessionId}
							sessionUrl={sessionUrl(event.sessionId)}
						/>
					</div>
					<LinkedRequest
						linked={group.linkedRequest}
						errorAt={event.timestamp}
						sessionUrl={sessionUrl(event.sessionId)}
					/>
				</>
			) : (
				<p className="tw:m-0 tw:px-5 tw:py-8 tw:text-center tw:text-[13px] tw:text-muted-foreground">
					No events of this group in the range.
				</p>
			)}
			<AffectedSessions
				sessions={group.affectedSessions ?? []}
				total={group.sessions}
				sessionUrl={sessionUrl}
			/>
		</section>
	);
}

export default ErrorDetailBody;
