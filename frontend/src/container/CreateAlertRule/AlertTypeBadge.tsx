import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import ROUTES from 'constants/routes';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { AlertTypes } from 'types/api/alerts/alertTypes';
import { isModifierKeyPressed } from 'utils/app';

import { ALERT_TYPE_BREADCRUMB_TITLE } from './defaults';

interface AlertTypeBadgeProps {
	alertType: AlertTypes;
}

/** The new rule's type beside the editor title, with a way back to the type list. */
function AlertTypeBadge({ alertType }: AlertTypeBadgeProps): JSX.Element {
	const { safeNavigate } = useSafeNavigate();

	return (
		<>
			<StatusBadge tone="info" testId="alert-type-badge">
				{ALERT_TYPE_BREADCRUMB_TITLE[alertType]}
			</StatusBadge>
			<button
				type="button"
				onClick={(e): void =>
					safeNavigate(ROUTES.ALERTS_NEW, { newTab: isModifierKeyPressed(e) })
				}
				data-testid="alert-change-type"
				className="tw:cursor-pointer tw:border-0 tw:bg-transparent tw:p-0 tw:text-[13px] tw:text-primary tw:hover:underline"
			>
				Change type
			</button>
		</>
	);
}

export default AlertTypeBadge;
