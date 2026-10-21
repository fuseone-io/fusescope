import { ReactNode } from 'react';
import { Group } from 'lucide-react';

import InfoTooltip from '../components/InfoTooltip';

interface EntityGroupHeaderProps {
	title: string;
	icon?: ReactNode;
	tooltip?: string;
}

function EntityGroupHeader({
	title,
	icon,
	tooltip,
}: EntityGroupHeaderProps): JSX.Element {
	return (
		<div
			className="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:uppercase"
			data-slot="entity-group-header"
		>
			<span data-slot="icon" className="tw:inline-flex tw:items-center">
				{icon || <Group size={14} data-hide-expanded="true" />}
			</span>
			{title}
			{tooltip && <InfoTooltip title={tooltip} />}
		</div>
	);
}

export default EntityGroupHeader;
