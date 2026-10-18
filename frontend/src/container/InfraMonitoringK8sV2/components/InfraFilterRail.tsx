import { ReactNode } from 'react';
import OverlayScrollbar from 'components/OverlayScrollbar/OverlayScrollbar';

interface InfraFilterRailProps {
	children: ReactNode;
}

/** The left pane of the infrastructure lists; scrolls on its own. */
function InfraFilterRail({ children }: InfraFilterRailProps): JSX.Element {
	return (
		<aside
			aria-label="Resources and filters"
			data-testid="infra-filter-rail"
			className="tw:flex tw:w-[264px] tw:min-w-[264px] tw:flex-col tw:border-r tw:border-border tw:bg-surface-raised"
		>
			<OverlayScrollbar>
				<div className="tw:flex tw:flex-col">{children}</div>
			</OverlayScrollbar>
		</aside>
	);
}

export default InfraFilterRail;
