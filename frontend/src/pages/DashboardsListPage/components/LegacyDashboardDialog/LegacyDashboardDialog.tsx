import { Button } from 'components/ui/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from 'components/ui/dialog';
import { ArrowUpRight, Copy, RotateCw } from 'lucide-react';
import { useCopyToClipboard } from 'react-use';
import { toast } from '@signozhq/ui/sonner';
import logEvent from 'api/common/logEvent';
import { handleContactSupport } from 'container/Integrations/utils';
import { useDashboardPermissions } from 'hooks/dashboards/useDashboardPermissions';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import AuthZButton from 'lib/authz/components/AuthZButton/AuthZButton';
import { DashboardListEvents } from 'pages/DashboardsListPage/constants/events';

import { useRetryMigration } from '../../hooks/useRetryMigration';

import styles from './LegacyDashboardDialog.module.scss';

interface LegacyDashboardDialogProps {
	open: boolean;
	dashboardId: string;
	dashboardName: string;
	onClose: () => void;
}

/**
 * Explains why a legacy (pre-v2) dashboard can't be opened in the new experience
 * and offers to re-run the migration. Legacy rows are surfaced by the list API
 * with `legacy: true` but have no v2 spec to render. Retrying runs a migrate
 * call, which the backend gates on dashboard:update.
 */
function LegacyDashboardDialog({
	open,
	dashboardId,
	dashboardName,
	onClose,
}: LegacyDashboardDialogProps): JSX.Element {
	const [, copyToClipboard] = useCopyToClipboard();
	const { isCloudUser } = useGetTenantLicense();
	const { retryMigration, isMigrating } = useRetryMigration(onClose);
	const { canEdit, editChecks } = useDashboardPermissions(dashboardId);

	const onCopyId = (): void => {
		copyToClipboard(dashboardId);
		toast.success('Dashboard ID copied');
		void logEvent(DashboardListEvents.LegacyDialogAction, {
			action: 'copyId',
			dashboardId,
		});
	};

	const onContactSupport = (): void => {
		handleContactSupport(!!isCloudUser);
		void logEvent(DashboardListEvents.LegacyDialogAction, {
			action: 'contactSupport',
			dashboardId,
		});
	};

	const onRetryMigration = (): void => {
		retryMigration(dashboardId);
		void logEvent(DashboardListEvents.LegacyDialogAction, {
			action: 'retryMigration',
			dashboardId,
		});
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next): void => {
				if (!next) {
					onClose();
				}
			}}
		>
			<DialogContent
				showCloseButton={false}
				aria-describedby={undefined}
				className="tw:max-w-[480px]"
			>
				<DialogHeader>
					<DialogTitle>
						This dashboard isn&apos;t available in the new experience
					</DialogTitle>
				</DialogHeader>
				<DialogBody className={styles.body}>
					<p className={styles.description}>
						<strong>{dashboardName || 'This dashboard'}</strong> hasn&apos;t been
						migrated to the new dashboard experience yet, so it can&apos;t be opened
						here.{' '}
						{canEdit
							? "Retrying the migration often works once we've handled the case that blocked it. If it still fails, share the dashboard ID below with support."
							: "Share the dashboard ID below with support and we'll help you move it over."}
					</p>

					<div className={styles.idField}>
						<span className={styles.idLabel}>Dashboard ID</span>
						<div className={styles.idRow}>
							<span className={styles.idValue} data-testid="legacy-dashboard-id">
								{dashboardId}
							</span>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label="Copy dashboard ID"
								onClick={onCopyId}
								data-testid="legacy-dashboard-copy-id"
							>
								<Copy />
							</Button>
						</div>
					</div>
				</DialogBody>
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={isMigrating}
						aria-disabled={isMigrating || undefined}
						onClick={onClose}
						data-testid="legacy-dashboard-close"
					>
						Close
					</Button>
					<Button
						type="button"
						variant={canEdit ? 'outline' : 'default'}
						size="sm"
						className={
							canEdit
								? 'tw:border-input tw:bg-surface-raised tw:dark:bg-surface-raised'
								: undefined
						}
						onClick={onContactSupport}
						data-testid="legacy-dashboard-contact-support"
					>
						Contact Support
						<ArrowUpRight />
					</Button>
					<AuthZButton
						checks={editChecks}
						variant="solid"
						color="primary"
						size="md"
						prefix={<RotateCw size={14} />}
						disabled={isMigrating}
						loading={isMigrating}
						onClick={onRetryMigration}
						testId="legacy-dashboard-retry-migration"
					>
						Retry migration
					</AuthZButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default LegacyDashboardDialog;
