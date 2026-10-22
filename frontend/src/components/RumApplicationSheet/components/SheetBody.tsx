import { RumtypesPlatformDTO } from 'api/generated/services/fuseScope.schemas';

import { ApplicationSheetState } from '../hooks/useApplicationSheet';
import { SheetActions } from '../hooks/useSheetActions';
import { initialFormValues, snippetKey } from '../utils/sheetValues';
import InstallTab from './InstallTab';
import KeysTab from './KeysTab';
import SettingsTab from './SettingsTab';

interface SheetBodyProps {
	sheet: ApplicationSheetState;
	actions: SheetActions;
	readOnly: boolean;
	onClose: () => void;
}

/** The active tab's content; each tab owns its scroll and footer. */
function SheetBody({
	sheet,
	actions,
	readOnly,
	onClose,
}: SheetBodyProps): JSX.Element {
	const { application, applicationId, keys, revealed } = sheet;

	if (sheet.tab === 'key' && application) {
		return (
			<KeysTab
				applicationName={application.name}
				keys={keys}
				revealed={revealed}
				readOnly={readOnly}
				onCreate={actions.createKey}
				onRotate={actions.rotateKey}
				onRevoke={actions.revokeKey}
			/>
		);
	}
	if (sheet.tab === 'install' && application) {
		return (
			<InstallTab
				application={application}
				publicKey={snippetKey(keys, revealed)}
				revealed={sheet.isNew ? revealed : undefined}
				status={sheet.status}
				onAddOrigin={readOnly ? undefined : actions.addOrigin}
				onBack={(): void => sheet.setTab('settings')}
				onDone={onClose}
			/>
		);
	}
	if (sheet.tab === 'settings' && !sheet.applicationLoading) {
		return (
			<SettingsTab
				key={`${application?.updatedAt ?? 'new'}-${sheet.pendingOrigin ?? ''}`}
				initial={initialFormValues(application, sheet.pendingOrigin)}
				platform={application?.platform ?? RumtypesPlatformDTO.web}
				creating={!applicationId}
				readOnly={readOnly}
				saving={sheet.mutations.saving}
				onCancel={onClose}
				onSubmit={actions.submit}
				onDelete={actions.remove}
			/>
		);
	}
	return <div aria-busy="true" />;
}

export default SheetBody;
