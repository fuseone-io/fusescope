import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { Button } from 'components/ui/button';
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';

import SectionActionsMenu from '../SectionActionsMenu/SectionActionsMenu';

import styles from './SectionHeader.module.scss';
import type { BrandedPermission } from 'lib/authz/hooks/useAuthZ/types';

export interface SectionDragHandle {
	attributes: DraggableAttributes;
	listeners: SyntheticListenerMap | undefined;
	setActivatorNodeRef: (element: HTMLElement | null) => void;
}

/** Editable-mode section actions — present together or not at all. */
export interface SectionHeaderActions {
	onRename: () => void;
	onAddPanel: () => void;
	onCloneSection: () => void;
	onDeleteSection: () => void;
}

interface SectionHeaderProps {
	sectionId: string;
	title: string;
	open: boolean;
	onToggle: () => void;
	repeatVariable?: string;
	/** Provided by SortableSection in sectioned mode; absent for untitled/free-flow. */
	dragHandle?: SectionDragHandle;
	/** Present for edit-permitted users; absent (no menu) in view mode. */
	actions?: SectionHeaderActions;
	/** Present when edits are unavailable — actions render disabled with its reason. */
	disabledChecks?: BrandedPermission[];
	disabledTooltip?: string;
}

function SectionDragHandleButton({
	dragHandle,
	sectionId,
}: {
	dragHandle: SectionDragHandle;
	sectionId: string;
}): JSX.Element {
	const { role: _role, ...sortableAttributes } = dragHandle.attributes;
	return (
		<span
			ref={dragHandle.setActivatorNodeRef}
			{...dragHandle.listeners}
			className={styles.dragHandle}
		>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label="Drag to reorder section"
				data-testid={`dashboard-section-drag-${sectionId}`}
				className={styles.dragButton}
				{...sortableAttributes}
			>
				<GripVertical />
			</Button>
		</span>
	);
}

function SectionHeader({
	sectionId,
	title,
	open,
	onToggle,
	repeatVariable,
	dragHandle,
	actions,
	disabledChecks = [],
	disabledTooltip,
}: SectionHeaderProps): JSX.Element {
	return (
		<div className={`fs-ui ${styles.header}`}>
			{dragHandle ? (
				<SectionDragHandleButton dragHandle={dragHandle} sectionId={sectionId} />
			) : null}
			<Button
				type="button"
				variant="ghost"
				size="sm"
				aria-expanded={open}
				onClick={onToggle}
				data-testid={`dashboard-section-toggle-${sectionId}`}
				className={styles.toggle}
			>
				{open ? <ChevronDown /> : <ChevronRight />}
				<span className={styles.title}>{title}</span>
				{repeatVariable ? (
					<span className={styles.repeatBadge}>(repeats per ${repeatVariable})</span>
				) : null}
			</Button>
			<span aria-hidden="true" className={styles.rule} />
			{actions ? (
				<SectionActionsMenu
					sectionId={sectionId}
					disabledChecks={disabledChecks}
					disabledTooltip={disabledTooltip}
					onAddPanel={actions.onAddPanel}
					onRename={actions.onRename}
					onCloneSection={actions.onCloneSection}
					onDeleteSection={actions.onDeleteSection}
				/>
			) : null}
		</div>
	);
}

export default SectionHeader;
