import { Link } from 'react-router-dom';
import type { RumtypesTimelineEventDTO } from 'api/generated/services/fuseScope.schemas';
import HttpStatusCodeBadge from 'components/PageTemplate/components/HttpStatusCodeBadge';
import { Button } from 'components/ui/button';
import { formatMs, shortId } from 'lib/rum/format';
import { traceDetailUrl } from 'lib/rum/links';
import { DraftingCompass } from 'lucide-react';

import { requestLabel } from '../../../Views/utils';

interface LinkedRequestProps {
	/** The failed request on the error's view shortly before it; null when none. */
	linked: RumtypesTimelineEventDTO | null;
	errorAt: string;
	sessionUrl: string;
}

const requestNote = (
	request: { durationMs: number; hasBackend: boolean; backendService: string },
	beforeSeconds: number,
): string =>
	[
		formatMs(request.durationMs),
		request.hasBackend ? `backend ${request.backendService || 'service'}` : '',
		`${beforeSeconds.toFixed(1)} s before the error, on the same view`,
	]
		.filter(Boolean)
		.join(' · ');

const HEADING =
	'tw:m-0 tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase';

function LinkedRequest({
	linked,
	errorAt,
	sessionUrl,
}: LinkedRequestProps): JSX.Element {
	const request = linked?.request;
	const before = linked
		? (Date.parse(errorAt) - Date.parse(linked.timestamp)) / 1000
		: 0;
	return (
		<section
			aria-labelledby="rum-error-request"
			data-testid="rum-error-request"
			className="tw:flex tw:flex-col tw:gap-2.5 tw:border-t tw:border-border tw:px-5 tw:pt-4 tw:pb-5"
		>
			<h3 id="rum-error-request" className={HEADING}>
				Linked backend request
			</h3>
			{request ? (
				<div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:rounded-lg tw:border tw:border-border tw:px-3.5 tw:py-2.5">
					<span className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
						<span className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
							{request.statusCode > 0 ? (
								<HttpStatusCodeBadge statusCode={request.statusCode} />
							) : (
								<span className="tw:text-xs tw:text-error-ink">no response</span>
							)}
							<span
								title={request.url}
								className="tw:truncate tw:font-mono tw:text-[13px] tw:font-medium"
							>
								{requestLabel(request)}
							</span>
						</span>
						<span className="tw:text-xs tw:text-muted-foreground tw:tabular-nums">
							{requestNote(request, before)}
						</span>
					</span>
					{request.traceId && (
						<span className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
							<span
								title={`trace_id ${request.traceId}`}
								className="tw:font-mono tw:text-xs tw:text-muted-foreground"
							>
								trace {shortId(request.traceId)}
							</span>
							<Button asChild size="sm">
								<Link
									to={traceDetailUrl(request.traceId, request.spanId)}
									data-testid="rum-error-request-trace"
									className="tw:bg-primary! tw:text-primary-foreground! tw:no-underline! tw:hover:bg-primary-strong!"
								>
									<DraftingCompass aria-hidden="true" />
									<span className="translate-safe">
										{request.hasBackend ? 'View backend trace' : 'View trace'}
									</span>
								</Link>
							</Button>
						</span>
					)}
				</div>
			) : (
				<div
					data-testid="rum-error-request-none"
					className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:rounded-lg tw:border tw:border-dashed tw:border-border tw:px-3.5 tw:py-3 tw:text-[13px] tw:text-muted-foreground"
				>
					<span>No failed request on this view shortly before the error.</span>
					<Link
						to={sessionUrl}
						className="tw:text-[13px] tw:text-primary! tw:hover:underline"
					>
						Requests in the timeline
					</Link>
				</div>
			)}
		</section>
	);
}

export default LinkedRequest;
