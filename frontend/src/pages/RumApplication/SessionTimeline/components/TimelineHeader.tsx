import { useState } from 'react';
import { useCopyToClipboard } from 'react-use';
import { Link, useLocation } from 'react-router-dom';
import type { RumtypesGettableSessionDTO } from 'api/generated/services/fuseScope.schemas';
import TagChip from 'components/PageTemplate/components/TagChip';
import { Button } from 'components/ui/button';
import { ApmWindow } from 'lib/apm/window';
import { clientLabel } from 'lib/rum/client';
import { shortId } from 'lib/rum/format';
import {
	logsExplorerUrl,
	rumSessionUrl,
	tracesExplorerUrl,
} from 'lib/rum/links';
import { Check, DraftingCompass, Link2, ScrollText } from 'lucide-react';

import { sessionFilter } from '../utils';

interface TimelineHeaderProps {
	applicationId: string;
	session: RumtypesGettableSessionDTO;
	window: ApmWindow;
}

function TimelineHeader({
	applicationId,
	session,
	window,
}: TimelineHeaderProps): JSX.Element {
	const { search } = useLocation();
	const [, copyToClipboard] = useCopyToClipboard();
	const [copied, setCopied] = useState(false);
	const filter = sessionFilter(applicationId, session.sessionId);
	const copy = (): void => {
		copyToClipboard(globalThis.location.href);
		setCopied(true);
	};

	return (
		<div className="tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-3">
			<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5">
				<span className="tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
					Session
				</span>
				<h2
					data-testid="rum-session-id"
					className="tw:m-0 tw:font-mono tw:text-base tw:font-semibold tw:break-all"
				>
					{session.sessionId}
				</h2>
				<span className="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
					{session.userId && (
						<TagChip title={`user.id ${session.userId}`}>
							user {shortId(session.userId)}
						</TagChip>
					)}
					<TagChip title="user_agent.original">
						{clientLabel(session.client)}
					</TagChip>
					{session.release && (
						<TagChip title="service.version">release {session.release}</TagChip>
					)}
					{session.environment && (
						<TagChip title="deployment.environment.name">
							env: {session.environment}
						</TagChip>
					)}
					{session.previousSessionId && (
						<span className="tw:text-xs tw:text-muted-foreground">
							after{' '}
							<Link
								to={`${rumSessionUrl(applicationId, session.previousSessionId)}${search}`}
								title={`session.previous_id ${session.previousSessionId}`}
								data-testid="rum-session-previous"
								className="tw:font-mono tw:text-primary! tw:hover:underline"
							>
								{shortId(session.previousSessionId)}
							</Link>
						</span>
					)}
				</span>
			</div>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
				<Button variant="outline" onClick={copy} data-testid="rum-session-copy">
					{copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
					<span className="translate-safe">{copied ? 'Copied' : 'Copy link'}</span>
				</Button>
				<Button asChild variant="outline">
					<Link to={logsExplorerUrl(filter, window)} data-testid="rum-session-logs">
						<ScrollText aria-hidden="true" />
						Logs of this session
					</Link>
				</Button>
				<Button asChild variant="outline">
					<Link
						to={tracesExplorerUrl(filter, window)}
						data-testid="rum-session-traces"
					>
						<DraftingCompass aria-hidden="true" />
						Traces of this session
					</Link>
				</Button>
			</div>
		</div>
	);
}

export default TimelineHeader;
