import { useState } from 'react';
import { useQueryClient } from 'react-query';
import { generatePath, matchPath, useLocation } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import axios from 'axios';
import { REACT_QUERY_KEY } from 'constants/reactQueryKeys';
import ROUTES from 'constants/routes';
import { useCreateFunnel } from 'hooks/TracesFunnels/useFunnels';
import { useNotifications } from 'hooks/useNotifications';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { Check } from 'lucide-react';

import FunnelDialog from '../FunnelDialog/FunnelDialog';
import FunnelTextField from '../FunnelTextField/FunnelTextField';

interface CreateFunnelProps {
	isOpen: boolean;
	onClose: (funnelId?: string) => void;
	redirectToDetails?: boolean;
}

function CreateFunnel({
	isOpen,
	onClose,
	redirectToDetails,
}: CreateFunnelProps): JSX.Element {
	const [funnelName, setFunnelName] = useState<string>('');
	const [inputError, setInputError] = useState<string>('');
	const createFunnelMutation = useCreateFunnel();
	const { notifications } = useNotifications();
	const queryClient = useQueryClient();
	const { safeNavigate } = useSafeNavigate();
	const { pathname } = useLocation();

	const handleCreate = (): void => {
		createFunnelMutation.mutate(
			{
				funnel_name: funnelName,
				timestamp: new Date().getTime(),
			},
			{
				onSuccess: (data) => {
					notifications.success({
						message: 'Funnel created successfully',
					});

					const eventMessage = matchPath(pathname, ROUTES.TRACE_DETAIL)
						? 'Trace Funnels: Funnel created from trace details page'
						: 'Trace Funnels: Funnel created from trace funnels list page';

					logEvent(eventMessage, {});

					setFunnelName('');
					setInputError('');
					queryClient.invalidateQueries([REACT_QUERY_KEY.GET_FUNNELS_LIST]);

					const funnelId = data?.payload?.funnel_id;

					onClose(funnelId);
					if (funnelId && redirectToDetails) {
						safeNavigate(
							generatePath(ROUTES.TRACES_FUNNELS_DETAIL, {
								funnelId,
							}),
						);
					}
				},
				onError: (error) => {
					if (axios.isAxiosError(error) && error.response?.status === 400) {
						const errorMessage =
							error.response?.data?.error?.message || 'Invalid funnel name';
						setInputError(errorMessage);
					} else {
						notifications.error({
							message: axios.isAxiosError(error)
								? error.response?.data?.error?.message
								: 'Failed to create funnel',
						});
					}
				},
			},
		);
	};

	const handleCancel = (): void => {
		setFunnelName('');
		setInputError('');
		onClose();
	};

	const handleInputChange = (value: string): void => {
		setFunnelName(value);
		if (inputError) {
			setInputError('');
		}
	};

	return (
		<FunnelDialog
			open={isOpen}
			title="Create new funnel"
			onCancel={handleCancel}
			confirm={{
				label: 'Create Funnel',
				icon: <Check className="tw:size-3.5" />,
				onClick: handleCreate,
				disabled: !funnelName.trim(),
				loading: createFunnelMutation.isLoading,
			}}
		>
			<FunnelTextField
				id="create-funnel-name"
				label="Enter funnel name"
				value={funnelName}
				onChange={handleInputChange}
				placeholder="Eg. checkout dropoff funnel"
				error={inputError}
				autoFocus
			/>
		</FunnelDialog>
	);
}

CreateFunnel.defaultProps = {
	redirectToDetails: true,
};
export default CreateFunnel;
