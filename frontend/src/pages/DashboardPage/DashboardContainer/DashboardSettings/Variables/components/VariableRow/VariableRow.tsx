import type { CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from 'lib/utils';
import { GripVertical } from 'lucide-react';

import type { VariableFormModel } from '../../variableFormModel';
import type { VariableRowSummary } from '../../utils/variableRowSummary';
import {
	BADGE_NEUTRAL,
	VALUE_CHIP,
} from '../../../components/settingsClassNames';
import VariableRowActions from './VariableRowActions';
import VariableTypeBadge from './VariableTypeBadge';

interface VariableRowProps {
	variable: VariableFormModel;
	index: number;
	canEdit: boolean;
	summary: VariableRowSummary;
	/** Variables this one's query reads. */
	dependsOn: string[];
	/** True when this row's delete is awaiting inline confirmation. */
	isConfirmingDelete: boolean;
	onEdit: (index: number) => void;
	onRequestDelete: (index: number) => void;
	onConfirmDelete: (index: number) => void;
	onCancelDelete: () => void;
	/** Apply this variable's filter to all panels. Dynamic variables only. */
	onApplyToAll: (index: number) => void;
	/** True when this dynamic variable is already applied to every panel. */
	isAppliedToAll: boolean;
}

/** A single draggable row of the variables list. */
function VariableRow({
	variable,
	index,
	canEdit,
	summary,
	dependsOn,
	isConfirmingDelete,
	onEdit,
	onRequestDelete,
	onConfirmDelete,
	onCancelDelete,
	onApplyToAll,
	isAppliedToAll,
}: VariableRowProps): JSX.Element {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: variable.name });

	const style: CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
		...(isDragging ? { position: 'relative', zIndex: 1, opacity: 0.8 } : {}),
	};

	let multiLabel: string | null = null;
	if (variable.type !== 'TEXT' && variable.multiSelect) {
		multiLabel = variable.showAllOption ? 'Multi · ALL' : 'Multi';
	}

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				'tw:grid tw:items-center tw:gap-2.5 tw:border-b tw:border-border tw:py-3 tw:pr-2 tw:pl-1.5 tw:last:border-b-0',
				canEdit
					? 'tw:grid-cols-[20px_minmax(0,1fr)_auto]'
					: 'tw:grid-cols-[minmax(0,1fr)] tw:pl-3',
				isDragging && 'tw:bg-surface-sunken',
			)}
			data-testid={`variable-row-${variable.name}`}
		>
			{canEdit ? (
				<span
					ref={setActivatorNodeRef}
					className="tw:flex tw:h-7 tw:w-5 tw:cursor-grab tw:items-center tw:justify-center tw:rounded tw:text-subtle-foreground tw:hover:text-foreground tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:outline-none"
					aria-label="Reorder variable"
					{...attributes}
					{...listeners}
				>
					<GripVertical className="tw:size-3.5" aria-hidden="true" />
				</span>
			) : null}

			<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1">
				<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
					<span className="tw:font-mono tw:text-[13px] tw:font-medium tw:text-foreground">
						<span aria-hidden="true">$</span>
						<span>{variable.name}</span>
					</span>
					<VariableTypeBadge type={variable.type} />
					{multiLabel && <span className={BADGE_NEUTRAL}>{multiLabel}</span>}
					{dependsOn.length > 0 && (
						<span className="tw:text-xs tw:text-subtle-foreground">
							depends on{' '}
							<span className="tw:font-mono">
								{dependsOn.map((name) => `$${name}`).join(', ')}
							</span>
						</span>
					)}
				</div>
				{variable.description && (
					<span className="tw:truncate tw:text-xs tw:text-muted-foreground">
						{variable.description}
					</span>
				)}
				<span
					className="tw:truncate tw:font-mono tw:text-xs tw:text-muted-foreground"
					title={summary.source}
				>
					{summary.source}
				</span>
				{summary.values.length > 0 && (
					<span className="tw:flex tw:flex-wrap tw:gap-1">
						{summary.values.map((value) => (
							<span key={value} className={VALUE_CHIP}>
								<span className="tw:truncate">{value}</span>
							</span>
						))}
						{summary.moreCount > 0 && (
							<span className={VALUE_CHIP}>+{summary.moreCount}</span>
						)}
					</span>
				)}
			</div>

			{canEdit ? (
				<VariableRowActions
					variable={variable}
					index={index}
					isConfirmingDelete={isConfirmingDelete}
					onEdit={onEdit}
					onRequestDelete={onRequestDelete}
					onConfirmDelete={onConfirmDelete}
					onCancelDelete={onCancelDelete}
					onApplyToAll={onApplyToAll}
					isAppliedToAll={isAppliedToAll}
				/>
			) : null}
		</div>
	);
}

export default VariableRow;
