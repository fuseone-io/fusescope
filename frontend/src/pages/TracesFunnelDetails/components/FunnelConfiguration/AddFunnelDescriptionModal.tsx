import { useState } from 'react';
import { useQueryClient } from 'react-query';
import { REACT_QUERY_KEY } from 'constants/reactQueryKeys';
import { useSaveFunnelDescription } from 'hooks/TracesFunnels/useFunnels';
import { useNotifications } from 'hooks/useNotifications';
import { Check } from 'lucide-react';
import FunnelDialog from 'pages/TracesFunnels/components/FunnelDialog/FunnelDialog';
import FunnelTextField from 'pages/TracesFunnels/components/FunnelTextField/FunnelTextField';

interface AddFunnelDescriptionProps {
	isOpen: boolean;
	onClose: () => void;
	funnelId: string;
	funnelDescription: string;
}

function AddFunnelDescriptionModal({
	isOpen,
	onClose,
	funnelId,
	funnelDescription,
}: AddFunnelDescriptionProps): JSX.Element {
	const [description, setDescription] = useState<string>(funnelDescription);
	const { notifications } = useNotifications();
	const queryClient = useQueryClient();

	const { mutate: saveFunnelDescription, isLoading } =
		useSaveFunnelDescription();

	const handleCancel = (): void => {
		setDescription('');
		onClose();
	};

	const handleSave = (): void => {
		saveFunnelDescription(
			{
				funnel_id: funnelId,
				description,
				timestamp: Date.now(),
			},
			{
				onSuccess: () => {
					queryClient.invalidateQueries([
						REACT_QUERY_KEY.GET_FUNNEL_DETAILS,
						funnelId,
					]);
					notifications.success({
						message: 'Success',
						description: 'Funnel description saved successfully',
					});
					handleCancel();
				},
				onError: (error) => {
					notifications.error({
						message: 'Failed to save funnel description',
						description: error.message,
					});
				},
			},
		);
	};

	return (
		<FunnelDialog
			open={isOpen}
			title="Add funnel description"
			onCancel={handleCancel}
			cancelDisabled={isLoading}
			confirm={{
				label: 'Save changes',
				icon: <Check className="tw:size-3.5" />,
				onClick: handleSave,
				loading: isLoading,
			}}
		>
			<FunnelTextField
				id={`funnel-description-${funnelId}`}
				label="Description"
				placeholder="(Optional) Eg. checkout dropoff funnel"
				value={description}
				onChange={setDescription}
				disabled={isLoading}
				multiline
				autoFocus
			/>
		</FunnelDialog>
	);
}

export default AddFunnelDescriptionModal;
