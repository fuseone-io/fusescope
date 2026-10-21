import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import type { StatusTone } from 'components/PageTemplate/types';
import TanStackTable from 'components/TanStackTableView';

import { StatusFilterKind, useStatusFilter } from './useStatusFilter';

interface ClickableStatusBadgeProps {
	tone: StatusTone;
	label: string;
	/** The status this badge stands for, applied as the filter when clicked. */
	status: string;
	kind: StatusFilterKind;
	rowId: string;
}

function ClickableStatusBadge({
	tone,
	label,
	status,
	kind,
	rowId,
}: ClickableStatusBadgeProps): JSX.Element {
	const { selected, setStatusFilter } = useStatusFilter(kind);

	// Clicking the status the list is already narrowed to has nothing left to
	// narrow, so it undoes the filter instead — but only when this status is the
	// whole filter, else it would silently drop the other selected statuses.
	const isWholeFilter = selected.length === 1 && selected[0] === status;

	return (
		<TanStackTable.HoverTooltip
			rowId={rowId}
			title={isWholeFilter ? `Clear ${label} filter` : `Filter by ${label}`}
			align="start"
		>
			<button
				type="button"
				className="fs-ui tw:inline-flex tw:cursor-pointer tw:rounded-sm tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:outline-none"
				data-testid={`status-badge-${status}`}
				onClick={(e): void => {
					e.preventDefault();
					e.stopPropagation();
					setStatusFilter(isWholeFilter ? [] : [status]);
				}}
			>
				<StatusBadge tone={tone} dot>
					{label}
				</StatusBadge>
			</button>
		</TanStackTable.HoverTooltip>
	);
}

export default ClickableStatusBadge;
