import HeaderPageActions from 'components/AppHeader/components/HeaderPageActions';
import LiveLogsPauseResume from 'container/LiveLogs/LiveLogsPauseResume/LiveLogsPauseResume';
import DateTimeSelectionV2 from 'container/TopNav/DateTimeSelectionV2';

import styles from './LogsTimeControls.module.scss';

interface LogsTimeControlsProps {
	showLiveLogs: boolean;
	onGoLive: () => void;
	onExitLiveLogs: () => void;
}

/**
 * The explorer's own time picker, in the app header where every other page
 * keeps its picker; it owns the `Live` option, so the page renders it.
 */
function LogsTimeControls({
	showLiveLogs,
	onGoLive,
	onExitLiveLogs,
}: LogsTimeControlsProps): JSX.Element {
	return (
		<HeaderPageActions>
			<div className={styles.timeControls} data-testid="logs-time-controls">
				{showLiveLogs && <LiveLogsPauseResume />}
				<DateTimeSelectionV2
					showLiveLogs={showLiveLogs}
					onExitLiveLogs={onExitLiveLogs}
					onGoLive={onGoLive}
					showAutoRefresh={false}
					showRefreshText={false}
					hideShareModal
				/>
			</div>
		</HeaderPageActions>
	);
}

export default LogsTimeControls;
