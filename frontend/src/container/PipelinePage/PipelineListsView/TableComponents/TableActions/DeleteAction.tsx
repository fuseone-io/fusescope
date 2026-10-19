import { Trash2 } from 'lucide-react';

import TableIconAction from './TableIconAction';

function DeleteAction({
	isPipelineAction,
	deleteAction,
}: DeleteActionProps): JSX.Element {
	return (
		<TableIconAction
			label={isPipelineAction ? 'Delete pipeline' : 'Delete processor'}
			danger={true}
			onClick={deleteAction}
			testId="pipeline-delete-action"
		>
			<Trash2 />
		</TableIconAction>
	);
}

export interface DeleteActionProps {
	isPipelineAction: boolean;
	deleteAction: VoidFunction;
}
export default DeleteAction;
