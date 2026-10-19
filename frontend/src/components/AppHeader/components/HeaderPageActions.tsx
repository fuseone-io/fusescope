import { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { usePageActionsSlot } from '../hooks/usePageActionsSlot';

import styles from '../AppHeader.module.scss';

interface HeaderPageActionsProps {
	children: ReactNode;
}

/**
 * Page-level actions shown in the app header, next to share and feedback.
 * Renders in place when no header is mounted (tests, stories without the shell).
 */
function HeaderPageActions({ children }: HeaderPageActionsProps): JSX.Element {
	const slot = usePageActionsSlot((s) => s.slot);

	return slot ? createPortal(children, slot) : <>{children}</>;
}

/** Where `HeaderPageActions` render; empty pages leave no gap. */
export function HeaderPageActionsSlot(): JSX.Element {
	const setSlot = usePageActionsSlot((s) => s.setSlot);

	return (
		<div
			ref={setSlot}
			data-testid="app-header-page-actions"
			className={styles.pageActions}
		/>
	);
}

export default HeaderPageActions;
