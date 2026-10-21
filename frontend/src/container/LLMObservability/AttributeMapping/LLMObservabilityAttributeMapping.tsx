import { useCallback, useEffect, useMemo } from 'react';
import { Tabs } from 'antd';
import logEvent from 'api/common/logEvent';
import { parseAsStringEnum, useQueryState } from 'nuqs';
import { useConfirmableAction } from 'hooks/useConfirmableAction';

import AttributeMappingActions from './components/AttributeMappingActions/AttributeMappingActions';
import AttributeMappingsTab from './AttributeMappingsTab/AttributeMappingsTab';
import DiscardChangesDialog from './components/DiscardChangesDialog/DiscardChangesDialog';
import GroupFormDrawer from './components/GroupFormDrawer/GroupFormDrawer';
import styles from './LLMObservabilityAttributeMapping.module.scss';
import TestTab from './TestTab/TestTab';
import { useAttributeMappingEditor } from './hooks/useAttributeMappingEditor';
import { useGroupFormDrawer } from './components/GroupFormDrawer/hooks/useGroupFormDrawer';
import { useTestSpanMapper } from './TestTab/useTestSpanMapper';
import { summarizeDraftChanges } from './summaries';

const MAPPINGS_TAB_KEY = 'attribute-mappings';
const TEST_TAB_KEY = 'test';
const TAB_PARAM = 'tab';

function LLMObservabilityAttributeMapping(): JSX.Element {
	const [activeTab, setActiveTab] = useQueryState(
		TAB_PARAM,
		parseAsStringEnum([MAPPINGS_TAB_KEY, TEST_TAB_KEY]).withDefault(
			MAPPINGS_TAB_KEY,
		),
	);
	const editor = useAttributeMappingEditor();
	const groupDrawer = useGroupFormDrawer();
	const spanTest = useTestSpanMapper(editor.snapshot, editor.groups);

	useEffect(() => {
		void logEvent('AI Observability Attribute Mapping: Page visited', {});
	}, []);

	const { discard } = editor;
	// Discarding wipes the whole working copy, so gate it behind a confirm
	// prompt rather than firing straight from the button.
	const discardConfirm = useConfirmableAction(
		useCallback(async (): Promise<void> => {
			discard();
		}, [discard]),
	);

	const changeSummary = useMemo(
		() =>
			editor.isDirty
				? summarizeDraftChanges(editor.snapshot, editor.groups)
				: null,
		[editor.isDirty, editor.snapshot, editor.groups],
	);

	const handleGroupSave = useCallback((): void => {
		editor.upsertGroup(groupDrawer.draft);
		groupDrawer.close();
	}, [editor, groupDrawer]);

	const tabItems = [
		{
			key: MAPPINGS_TAB_KEY,
			label: 'Attribute Mappings',
			children: (
				<AttributeMappingsTab
					editor={editor}
					onEditGroup={groupDrawer.openForEdit}
					onAddGroup={groupDrawer.openForAdd}
				/>
			),
		},
		{
			key: TEST_TAB_KEY,
			label: 'Test',
			children: <TestTab spanTest={spanTest} />,
		},
	];

	return (
		<div
			className={styles.llmObservabilityAttributeMapping}
			data-testid="llm-observability-attribute-mapping-page"
		>
			{editor.saveError && (
				<div className={styles.pageError} role="alert">
					{editor.saveError}
				</div>
			)}

			<AttributeMappingActions
				isDirty={editor.isDirty}
				isSaving={editor.isSaving}
				summary={changeSummary}
				onDiscard={discardConfirm.request}
				onSave={editor.save}
			/>

			<Tabs
				className={styles.tabs}
				activeKey={activeTab}
				onChange={(key): void => {
					void setActiveTab(key === TEST_TAB_KEY ? TEST_TAB_KEY : null);
				}}
				items={tabItems}
			/>
			{groupDrawer.isOpen && (
				<GroupFormDrawer
					isOpen={groupDrawer.isOpen}
					mode={groupDrawer.mode}
					draft={groupDrawer.draft}
					setDraft={groupDrawer.setDraft}
					onClose={groupDrawer.close}
					onSave={handleGroupSave}
				/>
			)}
			<DiscardChangesDialog
				open={discardConfirm.open}
				onConfirm={discardConfirm.confirm}
				onCancel={discardConfirm.cancel}
			/>
		</div>
	);
}

export default LLMObservabilityAttributeMapping;
