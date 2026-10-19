import { useState } from 'react';
import { useQueryClient } from 'react-query';
import { REACT_QUERY_KEY } from 'constants/reactQueryKeys';
import { useRenameFunnel } from 'hooks/TracesFunnels/useFunnels';
import { useNotifications } from 'hooks/useNotifications';
import { Check } from 'lucide-react';

import FunnelDialog from '../FunnelDialog/FunnelDialog';
import FunnelTextField from '../FunnelTextField/FunnelTextField';

interface RenameFunnelProps {
	isOpen: boolean;
	onClose: () => void;
	funnelId: string;
	initialName: string;
}

function RenameFunnel({
	isOpen,
	onClose,
	funnelId,
	initialName,
}: RenameFunnelProps): JSX.Element {
	const [newFunnelName, setNewFunnelName] = useState<string>(initialName);
	const renameFunnelMutation = useRenameFunnel();
	const { notifications } = useNotifications();
	const queryClient = useQueryClient();

	const handleRename = (): void => {
		renameFunnelMutation.mutate(
			{
				funnel_id: funnelId,
				funnel_name: newFunnelName,
				timestamp: new Date().getTime(),
			},
			{
				onSuccess: () => {
					notifications.success({
						message: 'Funnel renamed successfully',
					});
					queryClient.invalidateQueries([REACT_QUERY_KEY.GET_FUNNELS_LIST]);
					queryClient.invalidateQueries([
						REACT_QUERY_KEY.GET_FUNNEL_DETAILS,
						funnelId,
					]);
					onClose();
				},
				onError: () => {
					notifications.error({
						message: 'Failed to rename funnel',
					});
				},
			},
		);
	};

	const handleCancel = (): void => {
		setNewFunnelName(initialName);
		onClose();
	};

	return (
		<FunnelDialog
			open={isOpen}
			title="Rename Funnel"
			onCancel={handleCancel}
			confirm={{
				label: 'Rename Funnel',
				icon: <Check className="tw:size-3.5" />,
				onClick: handleRename,
				disabled: newFunnelName === initialName,
				loading: renameFunnelMutation.isLoading,
			}}
		>
			<FunnelTextField
				id={`rename-funnel-${funnelId}`}
				label="Enter a new name"
				value={newFunnelName}
				onChange={setNewFunnelName}
				autoFocus
			/>
		</FunnelDialog>
	);
}

export default RenameFunnel;
