import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { MarkdownRenderer } from 'components/MarkdownRenderer/MarkdownRenderer';
import { cn } from 'lib/utils';
import { IntegrationDetailedProps } from 'types/api/integrations/types';

import { LEGACY_BODY_CLASS } from './constants';

interface OverviewProps {
	categories: string[];
	assets: IntegrationDetailedProps['assets'];
	overviewContent: string;
	authorName?: string;
}

const LABEL_CLASS =
	'tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase';

function Overview(props: OverviewProps): JSX.Element {
	const { categories, assets, overviewContent, authorName } = props;
	const assetCounts = [
		{ label: 'Dashboards', count: assets?.dashboards?.length || 0 },
		{ label: 'Log pipelines', count: assets?.logs?.pipelines?.length || 0 },
		{ label: 'Alerts', count: assets?.alerts?.length || 0 },
	];

	return (
		<div className="tw:grid tw:items-start tw:gap-4 tw:lg:grid-cols-[minmax(0,1fr)_280px]">
			<ContentPanel
				testId="integration-overview"
				bodyClassName={cn('tw:px-5 tw:py-4', LEGACY_BODY_CLASS)}
			>
				<MarkdownRenderer variables={{}} markdownContent={overviewContent} />
			</ContentPanel>
			<ContentPanel title="Details" divided testId="integration-overview-details">
				<dl className="fs-ui tw:flex tw:flex-col tw:gap-4 tw:px-5 tw:py-4 tw:font-sans">
					<div className="tw:flex tw:flex-col tw:gap-2">
						<dt className={LABEL_CLASS}>Category</dt>
						<dd className="tw:flex tw:flex-wrap tw:gap-1.5">
							{categories.map((category) => (
								<StatusBadge key={category} tone="neutral">
									{category}
								</StatusBadge>
							))}
						</dd>
					</div>
					<div className="tw:flex tw:flex-col tw:gap-2">
						<dt className={LABEL_CLASS}>Included assets</dt>
						<dd>
							<ul className="tw:flex tw:flex-col tw:gap-1.5 tw:text-[13px]">
								{assetCounts.map(({ label, count }) => (
									<li
										key={label}
										className="tw:flex tw:items-center tw:justify-between tw:gap-3"
									>
										<span className="tw:text-muted-foreground">{label}</span>
										<span
											className={cn(
												'tw:font-medium tw:tabular-nums',
												count === 0 && 'tw:text-subtle-foreground',
											)}
										>
											{count}
										</span>
									</li>
								))}
							</ul>
						</dd>
					</div>
					{authorName && (
						<div className="tw:flex tw:flex-col tw:gap-2">
							<dt className={LABEL_CLASS}>Published by</dt>
							<dd className="tw:text-[13px]">{authorName}</dd>
						</div>
					)}
				</dl>
			</ContentPanel>
		</div>
	);
}

export default Overview;
