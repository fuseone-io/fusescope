import { mappingCountLabel } from 'container/LLMObservability/AttributeMapping/summaries';
import {
	DraftGroup,
	DraftMapper,
} from 'container/LLMObservability/AttributeMapping/types';
import { AttributeMappingEditor } from 'container/LLMObservability/AttributeMapping/hooks/useAttributeMappingEditor';

import GroupHeader from '../GroupHeader/GroupHeader';
import GroupHeaderActions from '../GroupHeaderActions/GroupHeaderActions';
import GroupMappers from '../GroupMappers/GroupMappers';

interface GroupPanelProps {
	group: DraftGroup;
	open: boolean;
	onToggleOpen: (localId: string) => void;
	editor: AttributeMappingEditor;
	onEditGroup: (group: DraftGroup) => void;
	onAddMapper: (groupLocalId: string) => void;
	onEditMapper: (groupLocalId: string, mapper: DraftMapper) => void;
}

/** One mapping group as a card: its header row, and its mappings when open. */
function GroupPanel({
	group,
	open,
	onToggleOpen,
	editor,
	onEditGroup,
	onAddMapper,
	onEditMapper,
}: GroupPanelProps): JSX.Element {
	const count = mappingCountLabel(group);

	return (
		<section
			aria-label={group.name}
			data-testid={`group-panel-${group.localId}`}
			className="tw:overflow-hidden tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:text-foreground"
		>
			<div className="fs-ui tw:flex tw:min-h-[52px] tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-2 tw:py-2 tw:pr-3 tw:pl-5 tw:font-sans">
				<GroupHeader
					group={group}
					open={open}
					onToggle={(): void => onToggleOpen(group.localId)}
				/>
				{count && (
					<span
						data-testid={`group-mapping-count-${group.localId}`}
						className="tw:text-xs tw:whitespace-nowrap tw:text-subtle-foreground tw:tabular-nums"
					>
						{count}
					</span>
				)}
				<GroupHeaderActions
					group={group}
					onToggle={editor.toggleGroup}
					onEdit={onEditGroup}
					onRemove={editor.removeGroup}
				/>
			</div>
			{open && (
				<div className="tw:overflow-x-auto tw:border-t tw:border-border">
					<GroupMappers
						group={group}
						editor={editor}
						onAddMapper={onAddMapper}
						onEditMapper={onEditMapper}
					/>
				</div>
			)}
		</section>
	);
}

export default GroupPanel;
