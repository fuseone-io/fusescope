import { PencilLine } from 'lucide-react';

import TableIconAction from './TableIconAction';

function EditAction({
	isPipelineAction,
	editAction,
}: EditActionProps): JSX.Element {
	return (
		<TableIconAction
			label={isPipelineAction ? 'Edit pipeline' : 'Edit processor'}
			onClick={editAction}
			testId="pipeline-edit-action"
		>
			<PencilLine />
		</TableIconAction>
	);
}

export interface EditActionProps {
	isPipelineAction: boolean;
	editAction: VoidFunction;
}
export default EditAction;
