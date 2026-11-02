import React, { useCallback } from 'react';
import { Tooltip } from 'antd';
import logEvent from 'api/common/logEvent';
import { Button } from 'components/ui/button';
import ROUTES from 'constants/routes';
import useComponentPermission from 'hooks/useComponentPermission';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { BookOpen, ListChecks, Plus, RefreshCw } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { DataSource } from 'types/common/queryBuilder';
import { isModifierKeyPressed } from 'utils/app';

import { ALERT_CARDS, ALERT_RULES_DOCS_URL } from './alertLinks';
import SampleAlertCard from './SampleAlertCard';

const alertLogEvents = (
	title: string,
	link: string,
	dataSource?: DataSource,
): void => {
	const attributes = {
		link,
		page: 'Alert empty state page',
	};

	void logEvent(title, dataSource ? { ...attributes, dataSource } : attributes);
};

interface AlertsEmptyStateProps {
	onRefresh?: () => void;
}

export function AlertsEmptyState({
	onRefresh,
}: AlertsEmptyStateProps): JSX.Element {
	const { user } = useAppContext();
	const { safeNavigate } = useSafeNavigate();
	const [addNewAlert] = useComponentPermission(
		['add_new_alert', 'action'],
		user.role,
	);

	const onClickNewAlertHandler = useCallback(
		(e: React.MouseEvent) => {
			safeNavigate(ROUTES.ALERTS_NEW, { newTab: isModifierKeyPressed(e) });
		},
		[safeNavigate],
	);

	return (
		<div className="fs-ui tw:flex tw:w-full tw:flex-col tw:gap-6 tw:font-sans">
			<section className="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised tw:px-6 tw:py-12 tw:text-center">
				<span className="tw:flex tw:size-10 tw:items-center tw:justify-center tw:rounded-full tw:bg-surface-sunken tw:text-subtle-foreground">
					<ListChecks aria-hidden="true" className="tw:size-5" />
				</span>
				<h2 className="tw:m-0 tw:text-base tw:font-semibold tw:text-foreground">
					No alert rules yet
				</h2>
				<p className="tw:m-0 tw:max-w-md tw:text-[13px] tw:text-muted-foreground">
					Alert rules watch your metrics, traces and logs, and notify your channels
					when a condition is met.
				</p>
				<div className="tw:mt-2 tw:flex tw:flex-wrap tw:items-center tw:justify-center tw:gap-2">
					<Tooltip
						title={
							addNewAlert ? undefined : 'You need permission to create alert rules'
						}
					>
						<span>
							<Button
								size="sm"
								onClick={onClickNewAlertHandler}
								disabled={!addNewAlert}
								data-testid="add-alert"
							>
								<Plus aria-hidden="true" />
								New Alert Rule
							</Button>
						</span>
					</Tooltip>
					{onRefresh && (
						<Button
							variant="outline"
							size="sm"
							onClick={onRefresh}
							data-testid="list-alerts-empty-refresh-button"
						>
							<RefreshCw aria-hidden="true" />
							Refresh
						</Button>
					)}
					<Button variant="ghost" size="sm" asChild>
						<a
							href={ALERT_RULES_DOCS_URL}
							target="_blank"
							rel="noopener noreferrer"
							onClick={(): void =>
								alertLogEvents('Alert: Tutorial doc link clicked', ALERT_RULES_DOCS_URL)
							}
						>
							<BookOpen aria-hidden="true" />
							Docs
						</a>
					</Button>
				</div>
			</section>

			<section className="tw:flex tw:flex-col tw:gap-3">
				<h3 className="tw:m-0 tw:text-xs tw:font-medium tw:tracking-wide tw:text-muted-foreground tw:uppercase">
					Start from an example
				</h3>
				<div className="tw:grid tw:grid-cols-1 tw:gap-3 tw:sm:grid-cols-2 tw:xl:grid-cols-4">
					{ALERT_CARDS.map((card) => (
						<SampleAlertCard
							key={card.header}
							header={card.header}
							subheader={card.subheader}
							dataSource={card.dataSource}
							link={card.link}
							onClick={(): void =>
								alertLogEvents(
									'Alert: Sample alert link clicked',
									card.link,
									card.dataSource,
								)
							}
						/>
					))}
				</div>
			</section>
		</div>
	);
}
