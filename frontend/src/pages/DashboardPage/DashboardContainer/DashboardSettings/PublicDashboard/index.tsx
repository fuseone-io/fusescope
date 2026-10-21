import type { DashboardtypesGettableDashboardV2DTO } from 'api/generated/services/fuseScope.schemas';

import PublicDashboardActions from './PublicDashboardActions/PublicDashboardActions';
import PublicDashboardHint from './PublicDashboardHint/PublicDashboardHint';
import PublicDashboardSettingsForm from './PublicDashboardSettingsForm/PublicDashboardSettingsForm';
import PublicDashboardStatus from './PublicDashboardStatus/PublicDashboardStatus';
import PublicDashboardUrl from './PublicDashboardUrl/PublicDashboardUrl';

import { usePublicDashboard } from './usePublicDashboard';
import SettingsSheetBody from '../components/SettingsSheetBody';
import SettingsSheetFooter from '../components/SettingsSheetFooter';

interface PublicDashboardSettingsProps {
	dashboard: DashboardtypesGettableDashboardV2DTO;
}

function PublicDashboardSettings({
	dashboard,
}: PublicDashboardSettingsProps): JSX.Element {
	const {
		isPublic,
		canManage,
		publishChecks,
		isLoading,
		isPublishing,
		isUpdating,
		isUnpublishing,
		timeRangeEnabled,
		defaultTimeRange,
		publicUrl,
		setTimeRangeEnabled,
		setDefaultTimeRange,
		onPublish,
		onUpdate,
		onUnpublish,
		onCopyUrl,
		onOpenUrl,
	} = usePublicDashboard(dashboard.id);

	const controlsDisabled = isLoading || !canManage;
	let controlsDisabledReason: string | undefined;
	if (isLoading) {
		controlsDisabledReason = 'Loading public dashboard settings';
	} else if (!canManage) {
		controlsDisabledReason = 'You need edit permission on this dashboard';
	}

	return (
		<>
			<SettingsSheetBody className="tw:gap-5">
				<PublicDashboardStatus isPublic={isPublic} />

				<PublicDashboardUrl
					isPublic={isPublic}
					url={publicUrl}
					onCopy={onCopyUrl}
					onOpen={onOpenUrl}
				/>

				<PublicDashboardSettingsForm
					timeRangeEnabled={timeRangeEnabled}
					defaultTimeRange={defaultTimeRange}
					disabled={controlsDisabled}
					disabledTooltip={controlsDisabledReason}
					onTimeRangeEnabledChange={setTimeRangeEnabled}
					onDefaultTimeRangeChange={setDefaultTimeRange}
				/>

				<PublicDashboardHint />
			</SettingsSheetBody>

			<SettingsSheetFooter>
				<PublicDashboardActions
					isPublic={isPublic}
					checks={publishChecks}
					isLoading={isLoading}
					isPublishing={isPublishing}
					isUpdating={isUpdating}
					isUnpublishing={isUnpublishing}
					onPublish={onPublish}
					onUpdate={onUpdate}
					onUnpublish={onUnpublish}
				/>
			</SettingsSheetFooter>
		</>
	);
}

export default PublicDashboardSettings;
