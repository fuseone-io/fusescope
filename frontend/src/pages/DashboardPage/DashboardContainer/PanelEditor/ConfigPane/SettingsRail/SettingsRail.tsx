import { Button } from 'components/ui/button';
import { PanelRightOpen } from 'lucide-react';
import {
	SECTION_METADATA,
	type SectionKind,
} from 'pages/DashboardPage/DashboardContainer/Panels/types/sections';

import styles from './SettingsRail.module.scss';

interface SettingsRailProps {
	sections: SectionKind[];
	onExpand: () => void;
	/** Expand the pane on this section. */
	onOpenSection: (kind: SectionKind) => void;
}

/** The collapsed settings pane: an icon per section, opening the pane on it. */
function SettingsRail({
	sections,
	onExpand,
	onOpenSection,
}: SettingsRailProps): JSX.Element {
	return (
		<nav
			className={`fs-ui ${styles.rail}`}
			aria-label="Panel settings (collapsed)"
			data-testid="panel-editor-settings-rail"
		>
			<Button
				variant="ghost"
				size="icon-sm"
				className="tw:text-muted-foreground"
				aria-label="Expand panel settings"
				onClick={onExpand}
			>
				<PanelRightOpen />
			</Button>
			{sections.map((kind) => {
				const { title, icon: Icon } = SECTION_METADATA[kind];
				return (
					<Button
						key={kind}
						variant="ghost"
						size="icon-sm"
						className="tw:text-muted-foreground"
						aria-label={title}
						title={title}
						onClick={(): void => onOpenSection(kind)}
					>
						<Icon size={16} />
					</Button>
				);
			})}
		</nav>
	);
}

export default SettingsRail;
