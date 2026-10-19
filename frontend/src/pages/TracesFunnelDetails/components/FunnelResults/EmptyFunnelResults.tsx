import { Funnel } from 'lucide-react';
import LearnMoreLink from 'pages/TracesFunnels/components/LearnMoreLink/LearnMoreLink';

function EmptyFunnelResults({
	title = 'No spans selected yet.',
	description = 'Add spans to the funnel steps to start seeing analytics here.',
}: {
	title?: string;
	description?: string;
}): JSX.Element {
	return (
		<div
			data-testid="funnel-results-empty"
			className="fs-ui tw:flex tw:flex-col tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised tw:px-6 tw:py-16 tw:text-center tw:font-sans tw:text-foreground"
		>
			<span
				aria-hidden="true"
				className="tw:flex tw:size-10 tw:items-center tw:justify-center tw:rounded-[10px] tw:bg-primary-soft tw:text-primary-ink"
			>
				<Funnel className="tw:size-5" />
			</span>
			<div className="tw:text-sm tw:font-semibold">{title}</div>
			<div className="tw:text-[13px] tw:text-muted-foreground">{description}</div>
			<LearnMoreLink />
		</div>
	);
}

export default EmptyFunnelResults;
