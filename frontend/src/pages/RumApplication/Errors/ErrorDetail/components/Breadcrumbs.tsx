import { Link } from 'react-router-dom';
import type { RumtypesTimelineEventDTO } from 'api/generated/services/fuseScope.schemas';
import { shortId } from 'lib/rum/format';

import { eventKey } from '../../../SessionTimeline/utils';
import BreadcrumbRow from './BreadcrumbRow';

interface BreadcrumbsProps {
	items: RumtypesTimelineEventDTO[];
	errorAt: string;
	sessionId: string;
	sessionUrl: string;
}

function Breadcrumbs({
	items,
	errorAt,
	sessionId,
	sessionUrl,
}: BreadcrumbsProps): JSX.Element {
	return (
		<section
			aria-labelledby="rum-error-breadcrumbs"
			data-testid="rum-error-breadcrumbs"
			className="tw:flex tw:min-w-0 tw:flex-[1_1_300px] tw:flex-col tw:gap-2 tw:border-t tw:border-border tw:px-5 tw:pt-4 tw:pb-5 tw:lg:border-t-0"
		>
			<div className="tw:flex tw:items-baseline tw:justify-between tw:gap-2">
				<h3
					id="rum-error-breadcrumbs"
					className="tw:m-0 tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase"
				>
					Breadcrumbs
				</h3>
				<span
					title={`session.id ${sessionId}`}
					className="tw:font-mono tw:text-[11px] tw:text-subtle-foreground"
				>
					session {shortId(sessionId)}
				</span>
			</div>
			<ol className="tw:relative tw:m-0 tw:flex tw:list-none tw:flex-col tw:p-0 tw:before:absolute tw:before:top-3 tw:before:bottom-3 tw:before:left-[76px] tw:before:w-px tw:before:bg-border">
				{items.map((event) => (
					<BreadcrumbRow key={eventKey(event)} event={event} errorAt={errorAt} />
				))}
			</ol>
			<span className="tw:text-xs tw:text-subtle-foreground">
				Views, clicks and requests before the error in this session.{' '}
				<Link
					to={sessionUrl}
					data-testid="rum-error-full-timeline"
					className="tw:text-primary! tw:hover:underline"
				>
					Full timeline
				</Link>
			</span>
		</section>
	);
}

export default Breadcrumbs;
