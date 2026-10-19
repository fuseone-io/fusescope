import { useTranslation } from 'react-i18next';
import { Button } from 'components/ui/button';
import { fuseScopeDocsUrl } from 'constants/docs';
import {
	ArrowRight,
	Database,
	ExternalLink,
	Filter,
	Inbox,
	Plus,
	Workflow,
} from 'lucide-react';

import { processorTypes } from './AddNewProcessor/config';

const STAGES = [
	{ label: 'Incoming logs', Icon: Inbox, tone: 'neutral' },
	{ label: 'Filter', Icon: Filter, tone: 'primary' },
	{ label: 'Processors', Icon: Workflow, tone: 'secondary' },
	{ label: 'Stored logs', Icon: Database, tone: 'success' },
] as const;

const STAGE_TONE: Record<(typeof STAGES)[number]['tone'], string> = {
	neutral: 'tw:bg-muted tw:text-muted-foreground tw:border-border',
	primary: 'tw:bg-primary-soft tw:text-primary-ink tw:border-transparent',
	secondary:
		'tw:bg-brand-secondary-soft tw:text-brand-secondary-ink tw:border-transparent',
	success: 'tw:bg-success-soft tw:text-success-ink tw:border-transparent',
};

interface PipelinesEmptyStateProps {
	onAddNewPipeline: () => void;
}

/** What pipelines do and where to start, before the first one exists. */
function PipelinesEmptyState({
	onAddNewPipeline,
}: PipelinesEmptyStateProps): JSX.Element {
	const { t } = useTranslation(['pipeline']);

	return (
		<section
			aria-labelledby="pipelines-empty-title"
			className="fs-ui tw:flex tw:flex-col tw:items-center tw:rounded-xl tw:border tw:border-border tw:bg-card tw:px-6 tw:py-14 tw:text-center tw:font-sans tw:text-foreground"
		>
			<div
				aria-hidden="true"
				className="tw:mb-6 tw:flex tw:flex-wrap tw:items-center tw:justify-center tw:gap-2.5"
			>
				{STAGES.map(({ label, Icon, tone }, index) => (
					<div key={label} className="tw:flex tw:items-center tw:gap-2.5">
						{index > 0 && (
							<ArrowRight className="tw:size-4 tw:text-subtle-foreground" />
						)}
						<div className="tw:flex tw:flex-col tw:items-center tw:gap-1.5 tw:text-xs tw:text-muted-foreground">
							<span
								className={`tw:flex tw:size-10 tw:items-center tw:justify-center tw:rounded-lg tw:border ${STAGE_TONE[tone]}`}
							>
								<Icon className="tw:size-[18px]" />
							</span>
							{label}
						</div>
					</div>
				))}
			</div>
			<h2
				id="pipelines-empty-title"
				className="tw:m-0 tw:text-lg tw:font-semibold"
			>
				No pipelines yet
			</h2>
			<p className="tw:mt-2 tw:mb-0 tw:max-w-[560px] tw:text-sm tw:text-muted-foreground">
				Pipelines transform logs before they are stored. Each pipeline picks logs
				with a filter and runs its processors in order to parse fields out of the
				body, normalize severity, add, move or remove attributes, and link logs to
				traces.
			</p>
			<ul className="tw:mt-4 tw:mb-0 tw:flex tw:max-w-[560px] tw:list-none tw:flex-wrap tw:justify-center tw:gap-1.5 tw:p-0">
				{processorTypes.map((type) => (
					<li
						key={type.key}
						className="tw:inline-flex tw:h-5 tw:items-center tw:rounded-sm tw:bg-brand-secondary-soft tw:px-2 tw:text-xs tw:font-medium tw:text-brand-secondary-ink"
					>
						{type.label}
					</li>
				))}
			</ul>
			<div className="tw:mt-6 tw:flex tw:flex-wrap tw:justify-center tw:gap-2">
				<Button onClick={onAddNewPipeline}>
					<Plus />
					{t('new_pipeline')}
				</Button>
				<Button variant="outline" asChild>
					<a
						href={fuseScopeDocsUrl('/sending-data/log-pipelines/')}
						target="_blank"
						rel="noopener noreferrer"
					>
						Read the docs
						<ExternalLink />
					</a>
				</Button>
			</div>
		</section>
	);
}

export default PipelinesEmptyState;
