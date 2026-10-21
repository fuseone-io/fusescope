import { useTranslation } from 'react-i18next';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { Button } from 'components/ui/button';
import { Check } from 'lucide-react';

import { getSetupSteps, KafkaChecks } from '../kafkaReadiness';
import { useKafkaSetupRedirect } from '../useKafkaSetupRedirect';

const SOURCE_CARD = {
	producers: 'Configure Producer',
	consumers: 'Configure Consumer',
	kafka: 'Monitor kafka',
} as const;

interface KafkaSetupPanelProps {
	checks: KafkaChecks;
	isLoading: boolean;
}

function KafkaSetupPanel({
	checks,
	isLoading,
}: KafkaSetupPanelProps): JSX.Element {
	const { t } = useTranslation('messagingQueuesKafkaOverview');
	const redirect = useKafkaSetupRedirect();
	const { steps, doneCount } = getSetupSteps(checks);

	return (
		<ContentPanel
			testId="kafka-setup"
			divided
			title={t('setup.title')}
			subtitle={t('setup.subtitle')}
			actions={
				isLoading ? (
					<StatusBadge tone="neutral">{t('setup.checking')}</StatusBadge>
				) : (
					<StatusBadge
						tone={doneCount === steps.length ? 'success' : 'warning'}
						testId="kafka-setup-progress"
					>
						{t('setup.progress', { done: doneCount, total: steps.length })}
					</StatusBadge>
				)
			}
		>
			<ol className="fs-ui tw:m-0 tw:list-none tw:p-0 tw:font-sans">
				{steps.map(({ service, done }, index) => (
					<li
						key={service}
						data-testid={`kafka-setup-step-${service}`}
						className="tw:grid tw:grid-cols-[28px_minmax(0,1fr)_auto] tw:items-center tw:gap-3 tw:border-b tw:border-border tw:px-5 tw:py-3.5 tw:last:border-b-0"
					>
						{done ? (
							<span className="tw:flex tw:size-6 tw:items-center tw:justify-center tw:rounded-full tw:bg-success-soft tw:text-success-ink">
								<Check className="tw:size-3.5" aria-label="Done" />
							</span>
						) : (
							<span className="tw:flex tw:size-6 tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-ink-subtle tw:text-xs tw:font-semibold tw:text-muted-foreground tw:tabular-nums">
								{index + 1}
							</span>
						)}
						<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
							<span className="tw:text-sm tw:font-semibold">
								{t(`setup.${service}.title`)}
							</span>
							<span className="tw:text-[13px] tw:text-muted-foreground">
								{t(`setup.${service}.description`)}
							</span>
						</div>
						{done ? (
							<StatusBadge tone="success">{t('setup.receiving')}</StatusBadge>
						) : (
							<Button
								variant="outline"
								size="sm"
								onClick={(event): void =>
									redirect(service, { sourceCard: SOURCE_CARD[service], event })
								}
							>
								{t('setup.getStarted')}
							</Button>
						)}
					</li>
				))}
			</ol>
		</ContentPanel>
	);
}

export default KafkaSetupPanel;
