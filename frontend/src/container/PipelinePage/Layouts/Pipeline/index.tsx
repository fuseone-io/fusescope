import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Pipeline } from 'types/api/pipeline/def';

import PipelineListsView from '../../PipelineListsView';
import CreatePipelineButton from './CreatePipelineButton';

function PipelinePageLayout({
	refetchPipelineLists,
	pipelineData,
	actionsTarget,
}: PipelinePageLayoutProps): JSX.Element {
	const [isActionType, setActionType] = useState<string>();
	const [isActionMode, setActionMode] = useState<string>('viewing-mode');

	const actions = (
		<CreatePipelineButton
			setActionType={setActionType}
			setActionMode={setActionMode}
			isActionMode={isActionMode}
			pipelineData={pipelineData}
		/>
	);

	return (
		<>
			{actionsTarget ? createPortal(actions, actionsTarget) : actions}
			<PipelineListsView
				isActionType={String(isActionType)}
				setActionType={setActionType}
				setActionMode={setActionMode}
				isActionMode={isActionMode}
				pipelineData={pipelineData}
				refetchPipelineLists={refetchPipelineLists}
			/>
		</>
	);
}

interface PipelinePageLayoutProps {
	refetchPipelineLists: VoidFunction;
	pipelineData: Pipeline;
	/** The page's section bar, which hosts the edit and create actions. */
	actionsTarget?: HTMLElement | null;
}

PipelinePageLayout.defaultProps = {
	actionsTarget: undefined,
};

export default PipelinePageLayout;
