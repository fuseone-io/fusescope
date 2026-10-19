import { useState } from 'react';
import { Modal } from 'antd';
import logEvent from 'api/common/logEvent';
import PipelineProcessingPreview from 'container/PipelinePage/PipelineListsView/Preview/PipelineProcessingPreview';
import { Eye } from 'lucide-react';
import { PipelineData } from 'types/api/pipeline/def';

import TableIconAction from '../../TableActions/TableIconAction';

function PreviewAction({ pipeline }: PreviewActionProps): JSX.Element | null {
	const [previewKey, setPreviewKey] = useState<string | null>(null);
	const isModalOpen = Boolean(previewKey);

	const openModal = (): void => setPreviewKey(String(Math.random()));
	const closeModal = (): void => setPreviewKey(null);

	// Can only preview pipelines with some processors in them
	if ((pipeline?.config?.length || 0) < 1) {
		return null;
	}

	const onOpenPreview = (): void => {
		openModal();
		logEvent('Logs: Pipelines: Clicked Preview Pipeline', {
			source: 'signoz-ui',
		});
	};

	return (
		<>
			<TableIconAction
				label={`Preview ${pipeline.name}`}
				onClick={onOpenPreview}
				testId="pipeline-preview-action"
			>
				<Eye />
			</TableIconAction>
			<Modal
				open={isModalOpen}
				onCancel={closeModal}
				centered
				width={800}
				footer={null}
				title={`Logs processing preview for ${pipeline.name}`}
				className="pipelines-modal"
			>
				{isModalOpen && (
					<PipelineProcessingPreview pipeline={pipeline} key={previewKey} />
				)}
			</Modal>
		</>
	);
}

export interface PreviewActionProps {
	pipeline: PipelineData;
}
export default PreviewAction;
