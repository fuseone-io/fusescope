import { Button } from 'components/ui/button';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import styles from './StatusBar.module.scss';

interface Props {
	collapsed: boolean;
	onToggleCollapse: () => void;
	count: number;
	total: number;
}

function StatusBar({
	collapsed,
	onToggleCollapse,
	count,
	total,
}: Props): JSX.Element {
	return (
		<div className={styles.statusBar}>
			<Button
				type="button"
				variant="ghost"
				size="xs"
				onClick={onToggleCollapse}
				data-testid="dashboards-rail-toggle"
				className="fs-ui tw:font-sans tw:text-muted-foreground"
			>
				{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
				{collapsed ? 'Expand' : 'Collapse'}
			</Button>
			<span className={styles.count}>
				{count} of {total} dashboards
			</span>
		</div>
	);
}

export default StatusBar;
