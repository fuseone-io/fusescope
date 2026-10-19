import { Trash2 } from 'lucide-react';
import FunnelDialog from 'pages/TracesFunnels/components/FunnelDialog/FunnelDialog';
import { useFunnelContext } from 'pages/TracesFunnels/FunnelContext';

interface DeleteFunnelStepProps {
	isOpen: boolean;
	onClose: () => void;
	onStepRemove: () => void;
}

function DeleteFunnelStep({
	isOpen,
	onClose,
	onStepRemove,
}: DeleteFunnelStepProps): JSX.Element {
	const { handleRunFunnel } = useFunnelContext();
	const handleStepRemoval = (): void => {
		onStepRemove();
		handleRunFunnel();
		onClose();
	};

	return (
		<FunnelDialog
			open={isOpen}
			title="Delete this step"
			onCancel={onClose}
			className="tw:max-w-[390px]"
			description="Deleting this step would stop further analytics using this step of the funnel."
			confirm={{
				label: 'Delete Step',
				icon: <Trash2 className="tw:size-3.5" />,
				onClick: handleStepRemoval,
				destructive: true,
			}}
		/>
	);
}

export default DeleteFunnelStep;
