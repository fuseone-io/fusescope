import { useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { upgradeIntegration } from 'api/Integrations/upgradeIntegration';
import { Button } from 'components/ui/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from 'components/ui/dialog';
import { SOMETHING_WENT_WRONG } from 'constants/api';
import { useNotifications } from 'hooks/useNotifications';
import { CircleArrowUp } from 'lucide-react';

import { IntegrationUpdate } from '../utils';

interface IntegrationUpdateButtonProps {
	integrationId: string;
	title: string;
	update: IntegrationUpdate;
	onUpdated: () => void;
}

function IntegrationUpdateButton({
	integrationId,
	title,
	update,
	onUpdated,
}: IntegrationUpdateButtonProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const { notifications } = useNotifications();
	const queryClient = useQueryClient();

	const { mutate, isLoading } = useMutation(upgradeIntegration, {
		onSuccess: () => {
			setOpen(false);
			notifications.success({ message: `${title} updated to v${update.to}` });
			void queryClient.invalidateQueries(['Integrations']);
			onUpdated();
		},
		onError: () => {
			notifications.error({ message: SOMETHING_WENT_WRONG });
		},
	});

	return (
		<>
			<Button
				variant="outline"
				data-testid="integration-update-button"
				onClick={(): void => setOpen(true)}
			>
				<CircleArrowUp aria-hidden="true" />
				Update to v{update.to}
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent data-testid="integration-update-dialog">
					<DialogHeader>
						<DialogTitle>
							Update {title} to v{update.to}
						</DialogTitle>
					</DialogHeader>
					<DialogBody>
						<DialogDescription>
							The {title} integration dashboards are replaced by the ones v{update.to}{' '}
							ships, keeping their links. Dashboards v{update.to} no longer ships are
							removed, and its log pipelines are deployed.
						</DialogDescription>
					</DialogBody>
					<DialogFooter>
						<Button variant="outline" size="sm" onClick={(): void => setOpen(false)}>
							Cancel
						</Button>
						<Button
							size="sm"
							disabled={isLoading}
							data-testid="integration-update-confirm"
							onClick={(): void => mutate({ integration_id: integrationId })}
						>
							Update
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

export default IntegrationUpdateButton;
