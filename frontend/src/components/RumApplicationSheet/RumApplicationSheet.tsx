import ApplicationSheet from './components/ApplicationSheet';
import { SheetTab, SheetTarget } from './types';

interface RumApplicationSheetProps {
	/** `null` closes the sheet. */
	target: SheetTarget | null;
	initialTab?: SheetTab;
	onClose: () => void;
	/** After the application is deleted, e.g. to leave its page. */
	onDeleted?: () => void;
}

/**
 * Create or edit a RUM application: settings, public keys and the install
 * snippet, with the setup status polled while the install tab is open.
 * State starts fresh for every application opened.
 */
function RumApplicationSheet({
	target,
	initialTab,
	onClose,
	onDeleted,
}: RumApplicationSheetProps): JSX.Element | null {
	if (!target) {
		return null;
	}
	return (
		<ApplicationSheet
			key={target.mode === 'edit' ? target.applicationId : 'new'}
			target={target}
			initialTab={initialTab}
			onClose={onClose}
			onDeleted={onDeleted}
		/>
	);
}

export default RumApplicationSheet;
