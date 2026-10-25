import { Link } from 'react-router-dom';
import type { RumtypesGettableErrorGroupDTO } from 'api/generated/services/fuseScope.schemas';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import TagChip from 'components/PageTemplate/components/TagChip';
import { Button } from 'components/ui/button';
import { BellPlus, History, ScrollText } from 'lucide-react';

import ErrorKindBadge from '../../components/ErrorKindBadge';
import EventSelector from './EventSelector';

interface ErrorDetailHeaderProps {
	group: RumtypesGettableErrorGroupDTO;
	position: { index: number; newer?: string; older?: string };
	onSelectEvent: (eventId: string) => void;
	logsUrl: string;
	alertUrl?: string;
	/** The selected event's session timeline. */
	sessionUrl?: string;
}

function ErrorDetailHeader({
	group,
	position,
	onSelectEvent,
	logsUrl,
	alertUrl,
	sessionUrl,
}: ErrorDetailHeaderProps): JSX.Element {
	const count = group.latestEvents?.length ?? 0;
	return (
		<div className="tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-3 tw:border-b tw:border-border tw:px-5 tw:py-4">
			<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5">
				<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
					<h2
						data-testid="rum-error-type"
						className="tw:m-0 tw:font-mono tw:text-base tw:font-medium tw:text-error-ink"
					>
						{group.type}
					</h2>
					<ErrorKindBadge group={group} testId="rum-error-kind" />
					<TagChip title="fusescope.rum.error.source">{group.source}</TagChip>
					{group.route && (
						<TagChip title="fusescope.rum.view.route">{group.route}</TagChip>
					)}
					{group.newInRelease && (
						<StatusBadge tone="info">New in {group.firstSeenRelease}</StatusBadge>
					)}
				</div>
				<p
					data-testid="rum-error-message"
					className="tw:m-0 tw:font-mono tw:text-xs tw:break-words tw:text-muted-foreground"
				>
					{group.message || '—'}
				</p>
				<span
					title="Exception type, normalized message and the top frame’s file and function"
					className="tw:font-mono tw:text-[11px] tw:text-subtle-foreground"
				>
					fingerprint {group.fingerprint}
				</span>
			</div>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
				{count > 1 && (
					<EventSelector
						index={position.index}
						count={count}
						newer={position.newer}
						older={position.older}
						onSelect={onSelectEvent}
					/>
				)}
				<Button asChild variant="outline" size="sm">
					<Link to={logsUrl} data-testid="rum-error-detail-logs">
						<ScrollText aria-hidden="true" />
						View in Logs
					</Link>
				</Button>
				{alertUrl && (
					<Button asChild variant="outline" size="sm">
						<Link
							to={alertUrl}
							title="Alert when this error happens more than 10 times in 5 minutes"
							data-testid="rum-error-create-alert"
						>
							<BellPlus aria-hidden="true" />
							Alert on this error
						</Link>
					</Button>
				)}
				{sessionUrl && (
					<Button asChild size="sm">
						<Link
							to={sessionUrl}
							data-testid="rum-error-session"
							className="tw:bg-primary! tw:text-primary-foreground! tw:no-underline! tw:hover:bg-primary-strong!"
						>
							<History aria-hidden="true" />
							Session timeline
						</Link>
					</Button>
				)}
			</div>
		</div>
	);
}

export default ErrorDetailHeader;
