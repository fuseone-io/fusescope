import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { Button } from 'components/ui/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from 'components/ui/dialog';
import { Input } from 'components/ui/input';
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import { LoaderCircle } from 'lucide-react';
import { toast } from '@signozhq/ui/sonner';
import logEvent from 'api/common/logEvent';
import {
	invalidateListDashboardsForUserV2,
	// eslint-disable-next-line no-restricted-imports -- list rename targets another dashboard by id; useOptimisticPatch is bound to the open dashboard's store/cache.
	patchDashboardV2,
} from 'api/generated/services/dashboard';
import type { DashboardtypesJSONPatchOperationDTO } from 'api/generated/services/fuseScope.schemas';
import { DashboardListEvents } from 'pages/DashboardsListPage/constants/events';
import { useErrorModal } from 'providers/ErrorModalProvider';
import APIError from 'types/api/error';

import { DASHBOARD_NAME_MAX_LENGTH } from '../../../DashboardPage/DashboardContainer/constants';

interface Props {
	open: boolean;
	dashboardId: string;
	currentName: string;
	onClose: () => void;
}

/** Renames a dashboard from the list via a `/spec/display/name` patch, then refreshes the list. */
function RenameDashboardModal({
	open,
	dashboardId,
	currentName,
	onClose,
}: Props): JSX.Element {
	const [name, setName] = useState(currentName);
	const queryClient = useQueryClient();
	const { showErrorModal } = useErrorModal();

	// Reset the field to the current name whenever the modal (re)opens.
	useEffect(() => {
		if (open) {
			setName(currentName);
		}
	}, [open, currentName]);

	const { mutate: runRename, isLoading } = useMutation({
		mutationFn: () => {
			const ops: DashboardtypesJSONPatchOperationDTO[] = [
				{
					op: 'replace' as DashboardtypesJSONPatchOperationDTO['op'],
					path: '/spec/display/name',
					value: name.trim(),
				},
			];
			return patchDashboardV2({ id: dashboardId }, ops);
		},
		onSuccess: async () => {
			toast.success('Dashboard renamed');
			void logEvent(DashboardListEvents.RowAction, {
				action: 'rename',
				dashboardId,
			});
			await invalidateListDashboardsForUserV2(queryClient);
			onClose();
		},
		onError: (error: APIError) => {
			showErrorModal(error);
		},
	});

	const trimmed = name.trim();
	const canSave = trimmed.length > 0 && trimmed !== currentName && !isLoading;

	const blockedReason =
		trimmed.length === 0
			? 'Enter a dashboard name first'
			: 'Change the name first';
	const blocked = trimmed.length === 0 || trimmed === currentName;

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
				className="tw:max-w-[440px]"
			>
				<DialogHeader>
					<DialogTitle>Rename dashboard</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<Input
						value={name}
						autoFocus
						maxLength={DASHBOARD_NAME_MAX_LENGTH}
						placeholder="Dashboard name"
						aria-label="Dashboard name"
						data-testid="rename-dashboard-input"
						className="tw:h-8 tw:border-input tw:bg-surface-raised tw:text-[13px] tw:text-foreground tw:dark:bg-surface-raised"
						onChange={(e): void => setName(e.target.value)}
						onKeyDown={(e): void => {
							if (e.key === 'Enter' && canSave) {
								runRename();
							}
						}}
					/>
				</DialogBody>
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onClose}
						data-testid="rename-dashboard-cancel"
					>
						Cancel
					</Button>
					<TitleTooltip title={blocked ? blockedReason : undefined}>
						<span className="tw:inline-flex">
							<Button
								type="button"
								size="sm"
								disabled={blocked || isLoading}
								aria-busy={isLoading || undefined}
								onClick={(): void => runRename()}
								data-testid="rename-dashboard-submit"
							>
								{isLoading && <LoaderCircle className="tw:animate-spin" />}
								<span>Save</span>
							</Button>
						</span>
					</TitleTooltip>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default RenameDashboardModal;
