import { useMemo } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import {
	DndContext,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
	SortableContext,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import { computeVariableDependencies } from '../../../../VariablesBar/utils/variableDependencies';
import { useCachedVariableOptions } from '../../hooks/useCachedVariableOptions';
import { summarizeVariable } from '../../utils/variableRowSummary';
import VariableRow from '../VariableRow/VariableRow';
import type { VariableFormModel } from '../../variableFormModel';

interface VariablesListProps {
	variables: VariableFormModel[];
	canEdit: boolean;
	/** Index whose delete is awaiting inline confirmation, if any. */
	confirmingIndex: number | null;
	onEdit: (index: number) => void;
	onRequestDelete: (index: number) => void;
	onConfirmDelete: (index: number) => void;
	onCancelDelete: () => void;
	onMove: (from: number, to: number) => void;
	onApplyToAll: (index: number) => void;
	/** Names of dynamic variables already applied to every panel. */
	appliedToAllNames: Set<string>;
}

function VariablesList({
	variables,
	canEdit,
	confirmingIndex,
	onEdit,
	onRequestDelete,
	onConfirmDelete,
	onCancelDelete,
	onMove,
	onApplyToAll,
	appliedToAllNames,
}: VariablesListProps): JSX.Element {
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 1 } }),
	);
	const cachedOptions = useCachedVariableOptions(variables);
	const parentGraph = useMemo(
		() => computeVariableDependencies(variables).parentGraph,
		[variables],
	);

	const handleDragEnd = ({ active, over }: DragEndEvent): void => {
		if (!over || active.id === over.id) {
			return;
		}
		const from = variables.findIndex((v) => v.name === active.id);
		const to = variables.findIndex((v) => v.name === over.id);
		if (from !== -1 && to !== -1) {
			onMove(from, to);
		}
	};

	return (
		<div
			className="tw:rounded-[10px] tw:border tw:border-border tw:bg-surface-raised"
			data-testid="variables-list"
		>
			<DndContext
				sensors={sensors}
				modifiers={[restrictToVerticalAxis]}
				onDragEnd={handleDragEnd}
			>
				<SortableContext
					items={variables.map((v) => v.name)}
					strategy={verticalListSortingStrategy}
				>
					{variables.map((variable, index) => (
						<VariableRow
							key={variable.name || `variable-${index}`}
							variable={variable}
							index={index}
							canEdit={canEdit}
							summary={summarizeVariable(variable, cachedOptions[variable.name])}
							dependsOn={parentGraph[variable.name] ?? []}
							isConfirmingDelete={confirmingIndex === index}
							onEdit={onEdit}
							onRequestDelete={onRequestDelete}
							onConfirmDelete={onConfirmDelete}
							onCancelDelete={onCancelDelete}
							onApplyToAll={onApplyToAll}
							isAppliedToAll={appliedToAllNames.has(variable.name)}
						/>
					))}
				</SortableContext>
			</DndContext>
		</div>
	);
}

export default VariablesList;
