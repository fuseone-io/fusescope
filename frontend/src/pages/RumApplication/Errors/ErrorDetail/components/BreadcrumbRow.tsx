import type { RumtypesTimelineEventDTO } from 'api/generated/services/fuseScope.schemas';
import HttpStatusCodeBadge from 'components/PageTemplate/components/HttpStatusCodeBadge';
import { cn } from 'lib/utils';
import {
	AppWindow,
	ArrowRight,
	LucideIcon,
	MousePointerClick,
	TriangleAlert,
} from 'lucide-react';

import { beforeError, describeBreadcrumb } from '../utils';

interface BreadcrumbRowProps {
	event: RumtypesTimelineEventDTO;
	errorAt: string;
}

const KINDS: Record<string, { icon: LucideIcon; className: string }> = {
	View: { icon: AppWindow, className: 'tw:bg-primary-soft tw:text-primary-ink' },
	Click: {
		icon: MousePointerClick,
		className: 'tw:bg-brand-secondary-soft tw:text-brand-secondary-ink',
	},
	Action: {
		icon: MousePointerClick,
		className: 'tw:bg-brand-secondary-soft tw:text-brand-secondary-ink',
	},
	Request: {
		icon: ArrowRight,
		className: 'tw:bg-muted tw:text-muted-foreground',
	},
	Error: {
		icon: TriangleAlert,
		className: 'tw:bg-error-soft tw:text-error-ink',
	},
};

function BreadcrumbRow({ event, errorAt }: BreadcrumbRowProps): JSX.Element {
	const description = describeBreadcrumb(event);
	const kind = KINDS[description.label] ?? KINDS.Request;
	const Icon = kind.icon;
	const bad = description.tone === 'error';
	return (
		<li
			data-testid="rum-error-breadcrumb"
			data-kind={event.kind}
			className="tw:relative tw:grid tw:grid-cols-[56px_22px_minmax(0,1fr)] tw:items-start tw:gap-2.5 tw:py-1.5"
		>
			<span className="tw:pt-0.5 tw:text-right tw:font-mono tw:text-[11px] tw:text-subtle-foreground tw:tabular-nums">
				{beforeError(event.timestamp, errorAt)}
			</span>
			<span
				aria-hidden="true"
				className={cn(
					'tw:relative tw:z-[1] tw:flex tw:size-[22px] tw:items-center tw:justify-center tw:rounded-full',
					kind.className,
				)}
			>
				<Icon className="tw:size-3" />
			</span>
			<span className="tw:flex tw:min-w-0 tw:flex-col tw:leading-snug">
				<span className="tw:flex tw:min-w-0 tw:items-center tw:gap-1.5">
					<span className="tw:text-[10px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
						{description.label}
					</span>
					{event.request && event.request.statusCode > 0 && (
						<HttpStatusCodeBadge statusCode={event.request.statusCode} />
					)}
				</span>
				<span
					title={event.request?.url || description.title}
					className={cn(
						'tw:truncate tw:font-mono tw:text-xs',
						bad ? 'tw:font-semibold tw:text-error-ink' : 'tw:text-foreground',
					)}
				>
					{description.title}
				</span>
				{description.detail && (
					<span className="tw:truncate tw:text-[11px] tw:text-subtle-foreground">
						{description.detail}
					</span>
				)}
			</span>
		</li>
	);
}

export default BreadcrumbRow;
