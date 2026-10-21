import { STATE_LABELS } from 'components/Alerts/constants';
import { STATE_BADGE_CLASSES, STATE_TONES } from 'components/Alerts/tones';
import { SEVERITY_TONES } from 'components/Alerts/tones';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { capitalize } from 'lodash-es';

interface AlertHeaderBadgesProps {
	state: string;
	severity?: string;
}

/** The rule's state and severity beside its name in the details header. */
function AlertHeaderBadges({
	state,
	severity,
}: AlertHeaderBadgesProps): JSX.Element {
	const stateKey = state === 'normal' ? 'inactive' : state;

	return (
		<>
			{STATE_LABELS[stateKey] && (
				<StatusBadge
					dot
					tone={STATE_TONES[stateKey] ?? 'neutral'}
					className={STATE_BADGE_CLASSES[stateKey]}
					testId="alert-header-state"
				>
					{STATE_LABELS[stateKey]}
				</StatusBadge>
			)}
			{severity && (
				<StatusBadge
					tone={SEVERITY_TONES[severity.toLowerCase()] ?? 'neutral'}
					testId="alert-header-severity"
				>
					{capitalize(severity)}
				</StatusBadge>
			)}
		</>
	);
}

export default AlertHeaderBadges;
