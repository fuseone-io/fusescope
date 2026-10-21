import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import { useListRules } from 'api/generated/services/rules';
import type { RuletypesRuleDTO } from 'api/generated/services/fuseScope.schemas';
import { STATE_LABELS } from 'components/Alerts/constants';
import { SEVERITY_TONES, STATE_TONES } from 'components/Alerts/tones';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { Button } from 'components/ui/button';
import { fuseScopeDocsUrl } from 'constants/docs';
import { QueryParams } from 'constants/query';
import ROUTES from 'constants/routes';
import history from 'lib/history';
import { mapQueryDataFromApi } from 'lib/newQueryBuilder/queryBuilderMappers/mapQueryDataFromApi';
import { Bell, BellRing, Plus } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { toCompositeMetricQuery } from 'types/api/alerts/convert';
import { USER_ROLES } from 'types/roles';

import HomeEmptyState from '../components/HomeEmptyState';
import HomeListItem from '../components/HomeListItem';
import HomeWidget from '../components/HomeWidget';
import WidgetLink from '../components/WidgetLink';
import { alertsSummary } from '../utils';

export default function AlertRules({
	onUpdateChecklistDoneItem,
	loadingUserPreferences,
}: {
	onUpdateChecklistDoneItem: (itemKey: string) => void;
	loadingUserPreferences: boolean;
}): JSX.Element {
	const { user } = useAppContext();
	const [rulesExist, setRulesExist] = useState(false);

	const [sortedAlertRules, setSortedAlertRules] = useState<RuletypesRuleDTO[]>(
		[],
	);

	const location = useLocation();
	const params = new URLSearchParams(location.search);

	// Fetch Alerts
	const {
		data: alerts,
		isError,
		isLoading,
	} = useListRules({
		query: { cacheTime: 0 },
	});

	useEffect(() => {
		const rules = alerts?.data ?? [];
		setRulesExist(rules.length > 0);

		const sortedRules = [...rules].sort((a, b) => {
			// First, prioritize firing alerts
			if (a.state === 'firing' && b.state !== 'firing') {
				return -1;
			}
			if (a.state !== 'firing' && b.state === 'firing') {
				return 1;
			}

			// Then sort by updatedAt timestamp
			return (
				new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
			);
		});

		if (sortedRules.length > 0 && !loadingUserPreferences) {
			onUpdateChecklistDoneItem('SETUP_ALERTS');
		}

		setSortedAlertRules(sortedRules.slice(0, 5));
	}, [alerts, onUpdateChecklistDoneItem, loadingUserPreferences]);

	const isViewer = user?.role === USER_ROLES.VIEWER;

	const emptyState = (
		<HomeEmptyState
			icon={<BellRing />}
			title="No Alert rules yet."
			description={isViewer ? undefined : 'Create an Alert Rule to get started'}
			action={
				isViewer ? undefined : (
					<Button asChild variant="outline" size="sm">
						<Link
							to={ROUTES.ALERTS_NEW}
							onClick={(): void => {
								void logEvent('Homepage: Create alert rule clicked', {});
							}}
							className="tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!"
						>
							<Plus aria-hidden="true" />
							Create Alert Rule
						</Link>
					</Button>
				)
			}
			onLearnMore={
				isViewer
					? undefined
					: (): void => {
							void logEvent('Homepage: Learn more clicked', {
								source: 'Alert Rules',
							});

							window.open(
								fuseScopeDocsUrl('/alerts/alert-rules/'),
								'_blank',
								'noreferrer noopener',
							);
						}
			}
		/>
	);

	const onEditHandler = (record: RuletypesRuleDTO) => (): void => {
		void logEvent('Homepage: Alert clicked', {
			ruleId: record.id,
			ruleName: record.alert,
			ruleState: record.state,
		});

		const compositeQuery = mapQueryDataFromApi(
			toCompositeMetricQuery(record.condition.compositeQuery),
		);
		params.set(
			QueryParams.compositeQuery,
			encodeURIComponent(JSON.stringify(compositeQuery)),
		);

		const panelType = record.condition.compositeQuery.panelType;
		if (panelType) {
			params.set(QueryParams.panelTypes, panelType);
		}

		params.set(QueryParams.ruleId, record.id);

		history.push(`${ROUTES.ALERT_OVERVIEW}?${params.toString()}`);
	};

	return (
		<HomeWidget
			title="Alerts"
			subtitle={alertsSummary(alerts?.data ?? []) || undefined}
			testId="home-alert-rules"
			pending={isLoading || isError}
			actions={
				rulesExist && (
					<WidgetLink
						to={ROUTES.LIST_ALL_ALERT}
						label="All alert rules"
						onClick={(): void => {
							void logEvent('Homepage: All alert rules clicked', {});
						}}
					/>
				)
			}
		>
			{rulesExist ? (
				<ul className="fs-ui tw:font-sans">
					{sortedAlertRules.map((rule) => (
						<HomeListItem
							key={rule.id}
							icon={<Bell />}
							label={rule.alert}
							onOpen={onEditHandler(rule)}
							trailing={
								<>
									{rule.labels?.severity && (
										<StatusBadge
											tone={
												SEVERITY_TONES[rule.labels.severity.toLowerCase()] ?? 'neutral'
											}
										>
											{rule.labels.severity.toLowerCase()}
										</StatusBadge>
									)}
									{STATE_LABELS[rule.state] && (
										<StatusBadge tone={STATE_TONES[rule.state] ?? 'neutral'} dot>
											{STATE_LABELS[rule.state]}
										</StatusBadge>
									)}
								</>
							}
						/>
					))}
				</ul>
			) : (
				emptyState
			)}
		</HomeWidget>
	);
}
