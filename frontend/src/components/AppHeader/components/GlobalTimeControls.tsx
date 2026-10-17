import HeaderRightSection from 'components/HeaderRightSection/HeaderRightSection';
import DateTimeSelector from 'container/TopNav/DateTimeSelectionV2';

import styles from '../AppHeader.module.scss';

/** The global picker and page actions; legacy widgets, so outside `fs-ui`. */
function GlobalTimeControls(): JSX.Element {
	return (
		<div className={styles.timeControls} data-testid="app-header-time-controls">
			<DateTimeSelector showAutoRefresh />
			<HeaderRightSection enableShare enableFeedback enableAnnouncements={false} />
		</div>
	);
}

export default GlobalTimeControls;
