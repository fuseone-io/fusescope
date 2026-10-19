import { useEffect, useState } from 'react';
import { useUpdateFunnelSteps } from 'hooks/TracesFunnels/useFunnels';
import { useNotifications } from 'hooks/useNotifications';
import { Check } from 'lucide-react';
import FunnelDialog from 'pages/TracesFunnels/components/FunnelDialog/FunnelDialog';
import FunnelTextField from 'pages/TracesFunnels/components/FunnelTextField/FunnelTextField';
import { useFunnelContext } from 'pages/TracesFunnels/FunnelContext';

import { FunnelStepPopoverProps } from './FunnelStepPopover';

interface AddFunnelStepDetailsModalProps {
	isOpen: boolean;
	onClose: () => void;
	stepData: FunnelStepPopoverProps['stepData'];
}

function AddFunnelStepDetailsModal({
	isOpen,
	onClose,
	stepData,
}: AddFunnelStepDetailsModalProps): JSX.Element {
	const { funnelId, steps, setSteps } = useFunnelContext();

	const [stepName, setStepName] = useState<string>(stepData?.name || '');
	const [description, setDescription] = useState<string>(
		stepData?.description || '',
	);
	const { notifications } = useNotifications();

	const { mutate: updateFunnelStepDetails, isLoading } = useUpdateFunnelSteps(
		funnelId,
		notifications,
	);

	useEffect(() => {
		if (isOpen) {
			setStepName(stepData?.name || '');
			setDescription(stepData?.description || '');
		}
	}, [isOpen, stepData?.name, stepData?.description]);

	const handleCancel = (): void => {
		setStepName('');
		setDescription('');
		onClose();
	};

	const handleSave = (): void => {
		updateFunnelStepDetails(
			{
				funnel_id: funnelId,
				steps: steps.map((step) => ({
					...step,
					...(step.step_order === stepData.step_order
						? {
								name: stepName || '',
								description: description || '',
							}
						: {}),
				})),
				timestamp: Date.now(),
			},
			{
				onSuccess: (data) => {
					if (data.payload?.steps) {
						setSteps(data.payload.steps);
					}
					notifications.success({
						message: 'Success',
						description: 'Funnel step details updated successfully',
					});
					handleCancel();
				},
				onError: (error) => {
					notifications.error({
						message: 'Failed to update funnel step details',
						description: error.message,
					});
				},
			},
		);
	};

	return (
		<FunnelDialog
			open={isOpen}
			title="Add funnel step details"
			onCancel={handleCancel}
			cancelDisabled={isLoading}
			confirm={{
				label: 'Save changes',
				icon: <Check className="tw:size-3.5" />,
				onClick: handleSave,
				disabled: !stepName.trim(),
				loading: isLoading,
			}}
		>
			<FunnelTextField
				id={`funnel-step-name-${stepData.step_order}`}
				label="Step name"
				placeholder="Eg. checkout-dropoff-funnel-step1"
				value={stepName}
				onChange={setStepName}
				disabled={isLoading}
				autoFocus
			/>
			<FunnelTextField
				id={`funnel-step-description-${stepData.step_order}`}
				label="Description"
				placeholder="Eg. checkout dropoff funnel"
				value={description}
				onChange={setDescription}
				disabled={isLoading}
				multiline
			/>
		</FunnelDialog>
	);
}

export default AddFunnelStepDetailsModal;
