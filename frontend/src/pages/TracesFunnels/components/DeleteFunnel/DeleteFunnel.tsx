import { useQueryClient } from 'react-query';
import { useHistory } from 'react-router-dom';
import { LOCALSTORAGE } from 'constants/localStorage';
import { REACT_QUERY_KEY } from 'constants/reactQueryKeys';
import ROUTES from 'constants/routes';
import { useDeleteFunnel } from 'hooks/TracesFunnels/useFunnels';
import { useLocalStorage } from 'hooks/useLocalStorage';
import { useNotifications } from 'hooks/useNotifications';
import { Trash2 } from 'lucide-react';
import { FunnelStepData } from 'types/api/traceFunnels';

import FunnelDialog from '../FunnelDialog/FunnelDialog';

interface DeleteFunnelProps {
	isOpen: boolean;
	onClose: () => void;
	funnelId: string;
	shouldRedirectToTracesListOnDeleteSuccess?: boolean;
}

function DeleteFunnel({
	isOpen,
	onClose,
	funnelId,
	shouldRedirectToTracesListOnDeleteSuccess,
}: DeleteFunnelProps): JSX.Element {
	const deleteFunnelMutation = useDeleteFunnel();
	const { notifications } = useNotifications();
	const queryClient = useQueryClient();

	const history = useHistory();
	const { pathname } = history.location;

	// localStorage hook for funnel steps
	const localStorageKey = `${LOCALSTORAGE.FUNNEL_STEPS}_${funnelId}`;
	const [, , clearLocalStorageSavedSteps] = useLocalStorage<
		FunnelStepData[] | null
	>(localStorageKey, null);

	const handleDelete = (): void => {
		deleteFunnelMutation.mutate(
			{
				id: funnelId,
			},
			{
				onSuccess: () => {
					notifications.success({
						message: 'Funnel deleted successfully',
					});
					clearLocalStorageSavedSteps();
					onClose();

					if (
						pathname !== ROUTES.TRACES_FUNNELS &&
						shouldRedirectToTracesListOnDeleteSuccess
					) {
						history.push(ROUTES.TRACES_FUNNELS);
						return;
					}
					queryClient.invalidateQueries([REACT_QUERY_KEY.GET_FUNNELS_LIST]);
				},
				onError: () => {
					notifications.error({
						message: 'Failed to delete funnel',
					});
				},
			},
		);
	};

	const handleCancel = (): void => {
		onClose();
	};

	return (
		<FunnelDialog
			open={isOpen}
			title="Delete this funnel"
			onCancel={handleCancel}
			className="tw:max-w-[390px]"
			description="Deleting the funnel would stop further analytics using this funnel. This is irreversible and cannot be undone."
			confirm={{
				label: 'Delete Funnel',
				icon: <Trash2 className="tw:size-3.5" />,
				onClick: handleDelete,
				loading: deleteFunnelMutation.isLoading,
				destructive: true,
			}}
		/>
	);
}

DeleteFunnel.defaultProps = {
	shouldRedirectToTracesListOnDeleteSuccess: true,
};

export default DeleteFunnel;
