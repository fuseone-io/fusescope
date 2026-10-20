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
import { RotateCcw } from 'lucide-react';
import logEvent from 'api/common/logEvent';
import { DashboardDetailEvents } from 'pages/DashboardPage/constants/events';

import { useDashboardStore } from '../../store/useDashboardStore';

interface DashboardChangedDialogProps {
	open: boolean;
	onReload: () => void;
	onDismiss: () => void;
}

function DashboardChangedDialog({
	open,
	onReload,
	onDismiss,
}: DashboardChangedDialogProps): JSX.Element {
	const dashboardId = useDashboardStore((s) => s.dashboardId);

	const handleReload = (): void => {
		void logEvent(DashboardDetailEvents.StaleReloadPrompted, {
			dashboardId,
			action: 'reload',
		});
		onReload();
	};

	const handleDismiss = (): void => {
		void logEvent(DashboardDetailEvents.StaleReloadPrompted, {
			dashboardId,
			action: 'dismiss',
		});
		onDismiss();
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen): void => {
				if (!isOpen) {
					onDismiss();
				}
			}}
		>
			<DialogContent showCloseButton={false} className="tw:max-w-[440px]">
				<DialogHeader>
					<DialogTitle>Dashboard updated elsewhere</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<DialogDescription className="tw:text-[13px]">
						This dashboard was changed in another tab or by another user. Reload to
						see the latest version.
					</DialogDescription>
				</DialogBody>
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={handleDismiss}
						data-testid="dashboard-changed-dismiss"
					>
						Dismiss
					</Button>
					<Button
						type="button"
						size="sm"
						onClick={handleReload}
						data-testid="dashboard-changed-reload"
					>
						<RotateCcw />
						Reload
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default DashboardChangedDialog;
