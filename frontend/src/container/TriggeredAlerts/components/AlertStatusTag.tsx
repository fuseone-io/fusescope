import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { StatusTone } from 'components/PageTemplate/types';

interface AlertStatusTagProps {
	state: string;
	testId?: string;
}

const STATUS: Record<string, { tone: StatusTone; label: string }> = {
	unprocessed: { tone: 'success', label: 'Unprocessed' },
	active: { tone: 'error', label: 'Firing' },
	suppressed: { tone: 'neutral', label: 'Suppressed' },
};

function AlertStatusTag({ state, testId }: AlertStatusTagProps): JSX.Element {
	const status = STATUS[state] ?? { tone: 'neutral', label: 'Unknown' };
	return (
		<StatusBadge dot tone={status.tone} testId={testId}>
			{status.label}
		</StatusBadge>
	);
}

export default AlertStatusTag;
