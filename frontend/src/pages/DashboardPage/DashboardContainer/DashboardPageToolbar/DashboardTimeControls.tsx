import HeaderPageActions from 'components/AppHeader/components/HeaderPageActions';
import HeaderRightSection from 'components/HeaderRightSection/HeaderRightSection';
import type { ShareURLExtraOption } from 'components/HeaderRightSection/ShareURLModal';
import DateTimeSelectionV2 from 'container/TopNav/DateTimeSelectionV2';

import styles from './DashboardTimeControls.module.scss';

interface DashboardTimeControlsProps {
	/** Extra row in the share modal: carry the selected variables in the link. */
	shareModalExtraOption?: ShareURLExtraOption;
}

/**
 * The dashboard's time picker, auto-refresh, share and feedback, in the app
 * header where every page keeps its picker. The page renders them so the share
 * modal can offer to include the dashboard's variables.
 */
function DashboardTimeControls({
	shareModalExtraOption,
}: DashboardTimeControlsProps): JSX.Element {
	return (
		<HeaderPageActions>
			<div className={styles.timeControls} data-testid="dashboard-time-controls">
				<DateTimeSelectionV2 showAutoRefresh hideShareModal />
				<HeaderRightSection
					enableAnnouncements={false}
					enableShare
					enableFeedback
					shareModalExtraOption={shareModalExtraOption}
				/>
			</div>
		</HeaderPageActions>
	);
}

export default DashboardTimeControls;
