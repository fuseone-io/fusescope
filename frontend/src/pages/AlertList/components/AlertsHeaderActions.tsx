import { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useAlertsHeaderActionsSlot } from './useAlertsHeaderActionsSlot';

interface AlertsHeaderActionsProps {
	children: ReactNode;
}

/**
 * Page actions of the active Alerts tab (e.g. New Alert), shown in the header
 * band. Renders in place when no band is mounted (tests, the tab on its own).
 */
function AlertsHeaderActions({
	children,
}: AlertsHeaderActionsProps): JSX.Element {
	const slot = useAlertsHeaderActionsSlot((s) => s.slot);

	return slot ? createPortal(children, slot) : <>{children}</>;
}

export default AlertsHeaderActions;
