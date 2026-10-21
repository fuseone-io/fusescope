import { useCallback, useState } from 'react';
import { Typography } from '@signozhq/ui/typography';
import { Layers, Plus } from '@signozhq/icons';
import { Skeleton } from 'antd';
import { Button } from 'components/ui/button';

import MapperFormDrawer from 'container/LLMObservability/AttributeMapping/components/MapperFormDrawer/MapperFormDrawer';
import { useMapperFormDrawer } from 'container/LLMObservability/AttributeMapping/components/MapperFormDrawer/hooks/useMapperFormDrawer';
import {
	DraftGroup,
	DraftMapper,
} from 'container/LLMObservability/AttributeMapping/types';
import { AttributeMappingEditor } from 'container/LLMObservability/AttributeMapping/hooks/useAttributeMappingEditor';
import { useCanManageAttributeMapping } from 'container/LLMObservability/AttributeMapping/hooks/useCanManageAttributeMapping';
import GroupPanel from './GroupPanel/GroupPanel';
import styles from './MappingsTable.module.scss';

const SKELETON_ROW_COUNT = 3;

interface MappingsTableProps {
	editor: AttributeMappingEditor;
	onEditGroup: (group: DraftGroup) => void;
	onAddGroup: () => void;
}

function MappingsTable({
	editor,
	onEditGroup,
	onAddGroup,
}: MappingsTableProps): JSX.Element {
	const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
	const [targetGroupId, setTargetGroupId] = useState<string | null>(null);
	const drawer = useMapperFormDrawer();
	const canManage = useCanManageAttributeMapping();

	const { upsertMapper, removeMapper } = editor;

	const handleAddMapper = useCallback(
		(groupLocalId: string): void => {
			setTargetGroupId(groupLocalId);
			// Keep the group open so the staged row is visible after save.
			setExpandedGroups((prev) =>
				prev.includes(groupLocalId) ? prev : [...prev, groupLocalId],
			);
			drawer.openForAdd();
		},
		[drawer],
	);

	const handleEditMapper = useCallback(
		(groupLocalId: string, mapper: DraftMapper): void => {
			setTargetGroupId(groupLocalId);
			drawer.openForEdit(mapper);
		},
		[drawer],
	);

	const handleSaveMapper = useCallback((): void => {
		if (targetGroupId) {
			upsertMapper(targetGroupId, drawer.draft);
		}
		drawer.close();
	}, [targetGroupId, upsertMapper, drawer]);

	const handleToggleOpen = useCallback((groupLocalId: string): void => {
		setExpandedGroups((prev) =>
			prev.includes(groupLocalId)
				? prev.filter((id) => id !== groupLocalId)
				: [...prev, groupLocalId],
		);
	}, []);

	const handleDeleteMapper = useCallback((): void => {
		if (targetGroupId && drawer.draft.id) {
			removeMapper(targetGroupId, drawer.draft.id);
		}
		drawer.close();
	}, [targetGroupId, removeMapper, drawer]);

	const isEmpty = !editor.isLoading && editor.groups.length === 0;

	const skeletonBanners = (
		<div className={styles.skeletonList}>
			{Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
				<div
					// eslint-disable-next-line react/no-array-index-key
					key={`group-skeleton-${index}`}
					className={styles.skeletonBanner}
				>
					<div className={styles.skeletonGroupLeft}>
						<Skeleton.Input
							active
							size="small"
							style={{ width: index % 2 === 0 ? 200 : 140 }}
						/>
						<Skeleton.Input active size="small" style={{ width: 64 }} />
					</div>
					<div className={styles.skeletonGroupRight}>
						<Skeleton.Button active size="small" shape="round" />
						<Skeleton.Avatar active size={16} shape="square" />
					</div>
				</div>
			))}
		</div>
	);

	return (
		<div className={styles.tableWrapper}>
			{canManage && (
				<div className={styles.toolbar}>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onAddGroup}
						disabled={editor.isLoading}
						data-testid="add-group-row"
						className="fs-ui"
					>
						<Plus size={14} />
						Add a new group
					</Button>
				</div>
			)}

			{isEmpty ? (
				<div className={styles.tableState} data-testid="mapper-groups-empty">
					<Layers size={24} />
					<Typography.Text as="span" size="base" color="muted">
						No mapping groups yet.
					</Typography.Text>
				</div>
			) : (
				<div data-testid="mappings-table" className={styles.groupList}>
					{editor.isLoading
						? skeletonBanners
						: editor.groups.map((group) => (
								<GroupPanel
									key={group.localId}
									group={group}
									open={expandedGroups.includes(group.localId)}
									onToggleOpen={handleToggleOpen}
									editor={editor}
									onEditGroup={onEditGroup}
									onAddMapper={handleAddMapper}
									onEditMapper={handleEditMapper}
								/>
							))}
				</div>
			)}

			{drawer.isOpen && (
				<MapperFormDrawer
					isOpen={drawer.isOpen}
					mode={drawer.mode}
					draft={drawer.draft}
					setDraft={drawer.setDraft}
					onClose={drawer.close}
					onSave={handleSaveMapper}
					onDelete={handleDeleteMapper}
					isSaving={false}
					isDeleting={false}
					saveError={null}
				/>
			)}
		</div>
	);
}

export default MappingsTable;
