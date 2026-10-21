import { ReactNode, useEffect, useMemo } from 'react';
import type { RuletypesRuleDTO } from 'api/generated/services/fuseScope.schemas';
import SubpageHeader from 'components/Alerts/SubpageHeader/SubpageHeader';
import TagChip from 'components/PageTemplate/components/TagChip';
import ROUTES from 'constants/routes';
import CreateAlertV2Header from 'container/CreateAlertV2/CreateAlertHeader';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { useAlertRule } from 'providers/Alert';
import {
	NEW_ALERT_SCHEMA_VERSION,
	PostableAlertRuleV2,
} from 'types/api/alerts/alertTypesV2';
import { isModifierKeyPressed } from 'utils/app';

import AlertActionButtons from './ActionButtons/ActionButtons';
import AlertHeaderBadges from './AlertHeaderBadges';

export type AlertHeaderProps = {
	alertDetails: RuletypesRuleDTO | PostableAlertRuleV2;
	/** The Overview / History tabs at the bottom of the band. */
	tabs?: ReactNode;
};

function AlertHeader({ alertDetails, tabs }: AlertHeaderProps): JSX.Element {
	const { state, alert: alertName, labels } = alertDetails;
	const { alertRuleState, alertRuleName, setAlertRuleName } = useAlertRule();
	const { safeNavigate } = useSafeNavigate();

	useEffect(() => {
		if (alertRuleName === undefined && alertName) {
			setAlertRuleName(alertName);
		}
	}, [alertRuleName, alertName, setAlertRuleName]);

	useEffect(() => (): void => setAlertRuleName(undefined), [setAlertRuleName]);

	const displayName = alertRuleName ?? alertName;

	const labelsWithoutSeverity = useMemo(
		() =>
			Object.entries(labels ?? {}).filter(([key]) => key !== 'severity') as [
				string,
				string,
			][],
		[labels],
	);

	const isV2Alert = alertDetails.schemaVersion === NEW_ALERT_SCHEMA_VERSION;

	return (
		<SubpageHeader
			testId="alert-details-header"
			title={
				<span data-testid="alert-header-title" title={displayName || ''}>
					{displayName || 'Untitled rule'}
				</span>
			}
			backLabel="Back to alert rules"
			onBack={(e): void =>
				safeNavigate(ROUTES.LIST_ALL_ALERT, { newTab: isModifierKeyPressed(e) })
			}
			badges={
				<AlertHeaderBadges
					state={alertRuleState ?? state ?? ''}
					severity={labels?.severity}
				/>
			}
			actions={
				<AlertActionButtons
					alertDetails={alertDetails}
					ruleId={alertDetails?.id || ''}
				/>
			}
			tabs={tabs}
		>
			{isV2Alert ? (
				<CreateAlertV2Header />
			) : (
				labelsWithoutSeverity.length > 0 && (
					<div
						data-testid="alert-header-labels"
						className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:gap-1.5 tw:font-sans"
					>
						{labelsWithoutSeverity.map(([key, value]) => (
							<TagChip key={key} title={`${key}: ${value}`}>
								{key}: {value}
							</TagChip>
						))}
					</div>
				)
			)}
		</SubpageHeader>
	);
}

export default AlertHeader;
