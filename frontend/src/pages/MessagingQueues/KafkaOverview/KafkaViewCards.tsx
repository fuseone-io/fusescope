import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { QueryParams } from 'constants/query';
import ROUTES from 'constants/routes';
import { cn } from 'lib/utils';
import {
	Gauge,
	LayoutGrid,
	LucideIcon,
	Rows3,
	Timer,
	TrendingUp,
} from 'lucide-react';
import { isModifierKeyPressed } from 'utils/app';
import { withBasePath } from 'utils/basePath';
import { openInNewTab } from 'utils/navigation';

import {
	getViewReadiness,
	KafkaChecks,
	ViewReadiness,
} from '../kafkaReadiness';
import { MessagingQueuesViewTypeOptions } from '../MessagingQueuesUtils';

const VIEWS: { view: MessagingQueuesViewTypeOptions; icon: LucideIcon }[] = [
	{ view: MessagingQueuesViewTypeOptions.ConsumerLag, icon: TrendingUp },
	{ view: MessagingQueuesViewTypeOptions.PartitionLatency, icon: Rows3 },
	{ view: MessagingQueuesViewTypeOptions.ProducerLatency, icon: Timer },
	{ view: MessagingQueuesViewTypeOptions.DropRate, icon: Gauge },
	{ view: MessagingQueuesViewTypeOptions.MetricPage, icon: LayoutGrid },
];

const READINESS_CLASS: Record<ViewReadiness['tone'], string> = {
	ready: 'tw:text-success-ink',
	missing: 'tw:text-warning-ink',
	unknown: 'tw:text-subtle-foreground',
};

const detailPath = (view: MessagingQueuesViewTypeOptions): string =>
	`${ROUTES.MESSAGING_QUEUES_KAFKA_DETAIL}?${QueryParams.mqServiceView}=${view}`;

function KafkaViewCards({ checks }: { checks: KafkaChecks }): JSX.Element {
	const { t } = useTranslation('messagingQueuesKafkaOverview');
	const history = useHistory();

	const openView = (
		view: MessagingQueuesViewTypeOptions,
		event: React.MouseEvent,
	): void => {
		event.preventDefault();
		void logEvent('Messaging Queues: View details clicked', {
			page: 'Messaging Queues Overview',
			source: view,
		});
		if (isModifierKeyPressed(event)) {
			openInNewTab(detailPath(view));
		} else {
			history.push(detailPath(view));
		}
	};

	return (
		<ContentPanel
			testId="kafka-views"
			title={t('views.title')}
			subtitle={t('views.subtitle')}
		>
			<div className="fs-ui tw:grid tw:grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] tw:gap-3 tw:px-5 tw:pb-5 tw:font-sans">
				{VIEWS.map(({ view, icon: Icon }) => {
					const readiness = getViewReadiness(view, checks);
					return (
						<a
							key={view}
							href={withBasePath(detailPath(view))}
							data-testid={`kafka-view-${view}`}
							onClick={(event): void => openView(view, event)}
							className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5 tw:rounded-[10px] tw:border tw:border-border tw:bg-surface-raised tw:p-4 tw:text-foreground! tw:no-underline! tw:transition-colors tw:hover:border-ink-subtle tw:hover:bg-surface-sunken tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:outline-none"
						>
							<span className="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:font-semibold">
								<Icon className="tw:size-4 tw:text-primary-ink" aria-hidden />
								{t(`views.${view}.title`)}
							</span>
							<span className="tw:text-[13px] tw:text-muted-foreground">
								{t(`views.${view}.description`)}
							</span>
							<span
								data-testid={`kafka-view-readiness-${view}`}
								className={cn('tw:pt-0.5 tw:text-xs', READINESS_CLASS[readiness.tone])}
							>
								{readiness.label}
							</span>
						</a>
					);
				})}
			</div>
		</ContentPanel>
	);
}

export default KafkaViewCards;
