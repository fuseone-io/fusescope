import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import type { DashboardtypesPanelDTO } from 'api/generated/services/fuseScope.schemas';

import { usePanelTitle } from '../hooks/usePanelTitle';
import styles from './ViewPanelModal.module.scss';

interface ViewPanelModalTitleProps {
	panel: DashboardtypesPanelDTO;
}

function ViewPanelModalTitle({ panel }: ViewPanelModalTitleProps): JSX.Element {
	const name = usePanelTitle(panel);

	return (
		<TitleTooltip title={name}>
			<span className={styles.title}>
				{name ? `${name} - (View mode)` : 'View mode'}
			</span>
		</TitleTooltip>
	);
}

export default ViewPanelModalTitle;
