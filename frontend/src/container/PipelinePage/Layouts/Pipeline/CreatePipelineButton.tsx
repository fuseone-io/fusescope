import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import logEvent from 'api/common/logEvent';
import { Button } from 'components/ui/button';
import { fuseScopeDocsUrl } from 'constants/docs';
import { ExternalLink, PencilLine } from 'lucide-react';
import { ActionMode, Pipeline } from 'types/api/pipeline/def';

import { checkDataLength } from '../utils';

function CreatePipelineButton({
	isActionMode,
	setActionMode,
	pipelineData,
}: CreatePipelineButtonProps): JSX.Element {
	const { t } = useTranslation(['pipeline']);

	const isAddNewPipelineVisible = useMemo(
		() => checkDataLength(pipelineData?.pipelines),
		[pipelineData?.pipelines],
	);
	const isDisabled = isActionMode === ActionMode.Editing;

	const onEnterEditMode = (): void => {
		setActionMode(ActionMode.Editing);

		logEvent('Logs: Pipelines: Entered Edit Mode', {
			source: 'signoz-ui',
		});
	};
	return (
		<div className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:font-sans">
			<a
				href={fuseScopeDocsUrl('/sending-data/log-pipelines/')}
				target="_blank"
				rel="noopener noreferrer"
				className="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-[13px] tw:text-primary tw:hover:underline"
			>
				{t('learn_more')}
				<ExternalLink aria-hidden="true" className="tw:size-3.5" />
			</a>
			{isAddNewPipelineVisible && (
				<Button
					variant="outline"
					size="sm"
					onClick={onEnterEditMode}
					disabled={isDisabled}
				>
					<PencilLine />
					{t('enter_edit_mode')}
				</Button>
			)}
		</div>
	);
}

interface CreatePipelineButtonProps {
	/** Unused since the empty state creates the first pipeline. */
	setActionType: (actionType: string) => void;
	isActionMode: string;
	setActionMode: (actionMode: string) => void;
	pipelineData: Pipeline;
}

export default CreatePipelineButton;
