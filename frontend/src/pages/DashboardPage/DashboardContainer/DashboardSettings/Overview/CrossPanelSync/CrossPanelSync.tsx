import logEvent from 'api/common/logEvent';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import { fuseScopeDocsUrl } from 'constants/docs';
import { Events } from 'constants/events';
import { DashboardDetailEvents } from 'pages/DashboardPage/constants/events';
import { useDashboardCursorSyncMode } from 'hooks/dashboard/useDashboardCursorSyncMode';
import { useSyncTooltipFilterMode } from 'hooks/dashboard/useSyncTooltipFilterMode';
import {
	DashboardCursorSync,
	SyncTooltipFilterMode,
} from 'lib/uPlotV2/plugins/TooltipPlugin/types';
import { getAbsoluteUrl } from 'utils/basePath';

import SettingsField from '../../components/SettingsField';

interface CrossPanelSyncProps {
	dashboardId: string;
}

function CrossPanelSync({ dashboardId }: CrossPanelSyncProps): JSX.Element {
	const [cursorSyncMode, setCursorSyncMode] =
		useDashboardCursorSyncMode(dashboardId);
	const [syncTooltipFilterMode, setSyncTooltipFilterMode] =
		useSyncTooltipFilterMode(dashboardId);

	const handleCursorSyncChange = (value: DashboardCursorSync): void => {
		void logEvent(DashboardDetailEvents.CursorSyncChanged, {
			mode: value,
			dashboardId,
		});
		setCursorSyncMode(value);
	};

	const handleTooltipFilterModeChange = (value: SyncTooltipFilterMode): void => {
		void logEvent(Events.TOOLTIP_SYNC_MODE_CHANGED, {
			path: getAbsoluteUrl(window.location.pathname),
			mode: value,
		});
		setSyncTooltipFilterMode(value);
	};

	return (
		<section
			aria-labelledby="dashboard-settings-cross-panel-sync"
			className="tw:flex tw:flex-col tw:gap-3.5 tw:border-t tw:border-border tw:pt-5"
		>
			<div>
				<h3
					id="dashboard-settings-cross-panel-sync"
					className="tw:m-0 tw:text-sm tw:font-semibold tw:text-foreground"
				>
					Cross-Panel Sync
				</h3>
				<p className="tw:m-0 tw:mt-0.5 tw:text-xs tw:text-muted-foreground">
					Sync crosshair and tooltip across all the dashboard panels.{' '}
					<a
						href={fuseScopeDocsUrl('/dashboards/dashboards/#dashboard-settings')}
						target="_blank"
						rel="noopener noreferrer"
						className="tw:text-primary tw:hover:underline"
					>
						Learn more
					</a>
				</p>
			</div>

			<div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] tw:gap-4">
				<SettingsField label="Sync Mode">
					<SegmentedControl
						label="Sync Mode"
						className="tw:self-start"
						value={cursorSyncMode}
						onChange={handleCursorSyncChange}
						options={[
							{
								label: 'No Sync',
								value: DashboardCursorSync.None,
								testId: `cursor-sync-mode-${DashboardCursorSync.None}`,
							},
							{
								label: 'Crosshair',
								value: DashboardCursorSync.Crosshair,
								testId: `cursor-sync-mode-${DashboardCursorSync.Crosshair}`,
							},
							{
								label: 'Tooltip',
								value: DashboardCursorSync.Tooltip,
								testId: `cursor-sync-mode-${DashboardCursorSync.Tooltip}`,
							},
						]}
					/>
				</SettingsField>

				{cursorSyncMode === DashboardCursorSync.Tooltip && (
					<SettingsField
						label="Synced Tooltip Series"
						description="Only the series that intersect on group-by, or every series with the matching ones highlighted."
					>
						<SegmentedControl
							label="Synced Tooltip Series"
							className="tw:self-start"
							value={syncTooltipFilterMode}
							onChange={handleTooltipFilterModeChange}
							options={[
								{
									label: 'All',
									value: SyncTooltipFilterMode.All,
									testId: `sync-tooltip-filter-mode-${SyncTooltipFilterMode.All}`,
								},
								{
									label: 'Filtered',
									value: SyncTooltipFilterMode.Filtered,
									testId: `sync-tooltip-filter-mode-${SyncTooltipFilterMode.Filtered}`,
								},
							]}
						/>
					</SettingsField>
				)}
			</div>
		</section>
	);
}

export default CrossPanelSync;
