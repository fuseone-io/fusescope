import { Link } from 'react-router-dom';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { Highlight, HighlightLink } from 'lib/apm/types';
import { cn } from 'lib/utils';
import { CircleAlert, TrendingUp, Zap } from 'lucide-react';

export interface HighlightTargets {
	slowTraces: string;
	errorTraces: string;
	onOpenEndpoints: () => void;
	onOpenDependencies: () => void;
}

interface HighlightsPanelProps {
	highlights: Highlight[];
	targets: HighlightTargets;
}

const LINK_CLASS =
	'tw:cursor-pointer tw:border-0 tw:bg-transparent tw:p-0 tw:text-[13px] tw:text-primary! tw:hover:underline';

const LINK_LABEL: Record<HighlightLink, string> = {
	slowTraces: 'View slowest traces',
	errorTraces: 'View error traces',
	endpoints: 'Open endpoints',
	dependencies: 'View dependency',
};

const ICON_CLASSES = {
	error: 'tw:bg-error-soft tw:text-error-ink',
	warning: 'tw:bg-warning-soft tw:text-warning-ink',
	info: 'tw:bg-primary-soft tw:text-primary-ink',
};

function HighlightAction({
	link,
	targets,
}: {
	link: HighlightLink;
	targets: HighlightTargets;
}): JSX.Element {
	if (link === 'slowTraces' || link === 'errorTraces') {
		return (
			<Link to={targets[link]} className={LINK_CLASS}>
				{LINK_LABEL[link]}
			</Link>
		);
	}
	return (
		<button
			type="button"
			className={LINK_CLASS}
			onClick={
				link === 'endpoints' ? targets.onOpenEndpoints : targets.onOpenDependencies
			}
		>
			{LINK_LABEL[link]}
		</button>
	);
}

/** Rule-based callouts: what changed against the previous period, and where to look. */
function HighlightsPanel({
	highlights,
	targets,
}: HighlightsPanelProps): JSX.Element {
	return (
		<ContentPanel
			testId="service-highlights"
			title="Highlights"
			subtitle="Changes against the previous period that crossed a rule: 2× latency, error rate or throughput, 50% errors, or a dependency failing half its calls."
			actions={
				highlights.length > 0 ? (
					<StatusBadge tone="warning">{`${highlights.length} active`}</StatusBadge>
				) : undefined
			}
		>
			{highlights.length === 0 ? (
				<p className="fs-ui tw:px-5 tw:pb-4 tw:font-sans tw:text-[13px] tw:text-muted-foreground">
					Nothing crossed a rule in this range.
				</p>
			) : (
				<ul className="fs-ui tw:m-0 tw:grid tw:list-none tw:grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] tw:gap-3 tw:px-5 tw:pt-1 tw:pb-5 tw:font-sans">
					{highlights.map((highlight) => (
						<li
							key={highlight.id}
							data-testid="service-highlight-callout"
							className="tw:flex tw:gap-3 tw:rounded-lg tw:border tw:border-border tw:p-3.5"
						>
							<span
								aria-hidden="true"
								className={cn(
									'tw:flex tw:size-8 tw:flex-none tw:items-center tw:justify-center tw:rounded-lg tw:[&_svg]:size-4',
									ICON_CLASSES[highlight.tone],
								)}
							>
								{highlight.tone === 'error' && <CircleAlert />}
								{highlight.tone === 'warning' && <Zap />}
								{highlight.tone === 'info' && <TrendingUp />}
							</span>
							<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1">
								<span className="tw:text-sm tw:font-semibold">{highlight.title}</span>
								<span className="tw:text-[13px] tw:text-muted-foreground tw:tabular-nums">
									{highlight.detail}
								</span>
								<span className="tw:flex tw:flex-wrap tw:gap-3 tw:pt-0.5">
									{highlight.links.map((link) => (
										<HighlightAction key={link} link={link} targets={targets} />
									))}
								</span>
							</div>
						</li>
					))}
				</ul>
			)}
		</ContentPanel>
	);
}

export default HighlightsPanel;
