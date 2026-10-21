import { useCallback } from 'react';
import logEvent from 'api/common/logEvent';
import SubpageHeader from 'components/Alerts/SubpageHeader/SubpageHeader';
import { Button } from 'components/ui/button';
import { QueryParams } from 'constants/query';
import ROUTES from 'constants/routes';
import AlertTypeBadge from 'container/CreateAlertRule/AlertTypeBadge';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import useUrlQuery from 'hooks/useUrlQuery';
import { AlertListTabs } from 'pages/AlertList/types';
import { RotateCcw } from 'lucide-react';

import { useCreateAlertState } from '../context';
import AlertRuleFields from './AlertRuleFields';

import './styles.scss';

/**
 * The rule name and labels. Creating a rule, they sit in the page's header
 * band with the title, the rule type and the way back to the classic form.
 */
function CreateAlertHeader(): JSX.Element {
	const { isEditMode, alertType } = useCreateAlertState();
	const { safeNavigate } = useSafeNavigate();
	const urlQuery = useUrlQuery();

	const handleSwitchToClassicExperience = useCallback(() => {
		logEvent('Alert: Switch to classic experience button clicked', {});

		urlQuery.set(QueryParams.showClassicCreateAlertsPage, 'true');
		const url = `${ROUTES.ALERTS_NEW}?${urlQuery.toString()}`;
		safeNavigate(url, { replace: true });
	}, [safeNavigate, urlQuery]);

	if (isEditMode) {
		return <AlertRuleFields />;
	}

	return (
		<SubpageHeader
			title="New Alert Rule"
			backLabel="Back to alert rules"
			onBack={(): void =>
				safeNavigate(`${ROUTES.LIST_ALL_ALERT}?tab=${AlertListTabs.ALERT_RULES}`)
			}
			badges={<AlertTypeBadge alertType={alertType} />}
			actions={
				<Button variant="ghost" size="sm" onClick={handleSwitchToClassicExperience}>
					<RotateCcw aria-hidden="true" />
					Switch to Classic Experience
				</Button>
			}
		>
			<AlertRuleFields />
		</SubpageHeader>
	);
}

export default CreateAlertHeader;
