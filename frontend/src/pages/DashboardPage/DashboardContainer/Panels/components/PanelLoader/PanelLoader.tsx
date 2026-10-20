import { LoaderCircle } from 'lucide-react';

import styles from './PanelLoader.module.scss';

interface PanelLoaderProps {
	'data-testid'?: string;
}

/** Centred full-panel spinner shown while a query is in flight with nothing to display yet. */
function PanelLoader({
	'data-testid': testId = 'panel-loading',
}: PanelLoaderProps): JSX.Element {
	return (
		<div
			className={styles.loader}
			data-testid={testId}
			role="status"
			aria-label="Loading"
		>
			<LoaderCircle size={18} className={`tw:animate-spin ${styles.spinner}`} />
		</div>
	);
}

export default PanelLoader;
