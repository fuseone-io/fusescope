import { Link } from 'react-router-dom';
import type { RuletypesRuleDTO } from 'api/generated/services/fuseScope.schemas';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { StatusTone } from 'components/PageTemplate/types';
import { Button } from 'components/ui/button';
import { Skeleton } from 'components/ui/skeleton';
import ROUTES from 'constants/routes';
import { ruleFilterSummary } from 'lib/apm/monitors';
import { BellPlus } from 'lucide-react';

interface MonitorsPanelProps {
	servicename: string;
	rules: RuletypesRuleDTO[];
	isLoading: boolean;
}

const STATE_TONE: Record<string, StatusTone> = {
	firing: 'error',
	pending: 'warning',
	recovering: 'warning',
	nodata: 'neutral',
	inactive: 'success',
	disabled: 'neutral',
};

const STATE_LABEL: Record<string, string> = {
	firing: 'Firing',
	pending: 'Pending',
	recovering: 'Recovering',
	nodata: 'No data',
	inactive: 'OK',
	disabled: 'Disabled',
};

const ruleUrl = (id: string): string =>
	`${ROUTES.ALERT_OVERVIEW}?ruleId=${encodeURIComponent(id)}`;

/** Alert rules whose filter or labels name this service. */
function MonitorsPanel({
	servicename,
	rules,
	isLoading,
}: MonitorsPanelProps): JSX.Element {
	return (
		<ContentPanel
			testId="service-monitors"
			title="Monitors"
			subtitle={
				<>
					Alert rules whose filter matches{' '}
					<span className="tw:font-mono">service.name = {servicename}</span>
				</>
			}
			actions={
				<Button asChild variant="outline" size="sm">
					<Link to={ROUTES.ALERTS_NEW} data-testid="service-monitors-create">
						<BellPlus aria-hidden="true" />
						Create alert
					</Link>
				</Button>
			}
			footer={
				<Link
					to={ROUTES.LIST_ALL_ALERT}
					className="tw:text-primary! tw:hover:underline"
				>
					All alert rules
				</Link>
			}
			divided
		>
			<ul className="fs-ui tw:m-0 tw:list-none tw:p-0 tw:font-sans">
				{isLoading && (
					<li className="tw:px-5 tw:py-3">
						<Skeleton className="tw:h-10 tw:bg-muted" />
					</li>
				)}
				{!isLoading && rules.length === 0 && (
					<li className="tw:px-5 tw:py-6 tw:text-center tw:text-[13px] tw:text-muted-foreground">
						No alert rule covers this service yet.
					</li>
				)}
				{rules.map((rule) => (
					<li
						key={rule.id}
						data-testid="service-monitor"
						className="tw:flex tw:items-start tw:gap-3 tw:border-b tw:border-border tw:px-5 tw:py-3 tw:last:border-b-0"
					>
						<StatusBadge tone={STATE_TONE[rule.state] ?? 'neutral'} dot>
							{STATE_LABEL[rule.state] ?? rule.state}
						</StatusBadge>
						<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
							<Link
								to={ruleUrl(rule.id)}
								className="tw:truncate tw:text-[13px] tw:font-medium tw:text-foreground! tw:hover:underline"
							>
								{rule.alert}
							</Link>
							<span className="tw:truncate tw:font-mono tw:text-xs tw:text-muted-foreground">
								{ruleFilterSummary(rule)}
							</span>
						</div>
					</li>
				))}
			</ul>
		</ContentPanel>
	);
}

export default MonitorsPanel;
