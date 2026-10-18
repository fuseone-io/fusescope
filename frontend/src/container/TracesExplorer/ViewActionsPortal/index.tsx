import { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ViewActionsPortalProps {
	/** The explorer's view bar; without one the actions render in place. */
	target?: HTMLElement | null;
	children: ReactNode;
}

function ViewActionsPortal({
	target,
	children,
}: ViewActionsPortalProps): JSX.Element {
	if (target) {
		return createPortal(children, target);
	}
	return <>{children}</>;
}

ViewActionsPortal.defaultProps = {
	target: undefined,
};

export default ViewActionsPortal;
