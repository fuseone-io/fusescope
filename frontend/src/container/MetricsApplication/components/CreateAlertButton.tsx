import { Button } from 'components/ui/button';
import useCreateAlerts from 'hooks/queryBuilder/useCreateAlerts';
import { BellPlus } from 'lucide-react';
import { Widgets } from 'types/api/widgets/widget';

interface CreateAlertButtonProps {
	widget: Widgets;
	testId?: string;
}

/** Opens the alert editor seeded with the chart's query, as its menu's Create alerts does. */
function CreateAlertButton({
	widget,
	testId,
}: CreateAlertButtonProps): JSX.Element {
	// The service charts are V1 widgets; this is the action their own menu runs.
	const createAlert = useCreateAlerts(widget, 'dashboardView');
	return (
		<Button variant="ghost" size="xs" onClick={createAlert} data-testid={testId}>
			<BellPlus aria-hidden="true" />
			Create alert
		</Button>
	);
}

export default CreateAlertButton;
