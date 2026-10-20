import { Button } from 'components/ui/button';
import { Plus } from 'lucide-react';

import { useDashboardStore } from '../../../store/useDashboardStore';

/**
 * Labelled "Add variable" button shown in the empty state, before any variables
 * exist. Opens the Variables settings tab with the add form primed.
 */
function AddVariableFull(): JSX.Element {
	const requestSettings = useDashboardStore((s) => s.requestSettings);

	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			data-testid="dashboard-variables-add"
			className="fs-ui tw:font-sans tw:text-muted-foreground"
			onClick={(): void =>
				requestSettings({ tab: 'Variables', addVariable: true })
			}
		>
			<Plus />
			Add variable
		</Button>
	);
}

export default AddVariableFull;
