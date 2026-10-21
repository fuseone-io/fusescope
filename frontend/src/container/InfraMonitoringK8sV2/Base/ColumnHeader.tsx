import { ReactNode } from 'react';
import { cn } from 'lib/utils';

import InfoTooltip from '../components/InfoTooltip';

interface ColumnHeaderProps {
	children?: ReactNode;
	tooltip?: ReactNode;
	className?: string;
}

function ColumnHeader({
	children,
	tooltip,
	className,
}: ColumnHeaderProps): JSX.Element {
	return (
		<div
			className={cn(
				'tw:inline-flex tw:items-center tw:gap-1.5 tw:text-wrap',
				className,
			)}
			data-slot="column-header"
		>
			<div className="tw:py-1 tw:text-left tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:uppercase">
				{children}
			</div>
			{tooltip && <InfoTooltip title={tooltip} />}
		</div>
	);
}

export default ColumnHeader;
