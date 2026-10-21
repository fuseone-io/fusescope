import { type ReactNode, useCallback } from 'react';
import { SolidAlertTriangle, X } from '@signozhq/icons';
import { Badge } from '@signozhq/ui/badge';
import { Button } from '@signozhq/ui/button';
import { DialogWrapper } from '@signozhq/ui/dialog';
import { Divider } from '@signozhq/ui/divider';
import { Typography } from '@signozhq/ui/typography';
import logEvent from 'api/common/logEvent';
import HeaderRightSection from 'components/HeaderRightSection/HeaderRightSection';
import { useConfirmableAction } from 'hooks/useConfirmableAction';

import { DashboardDetailEvents } from 'pages/DashboardPage/constants/events';

import AuthZTooltip from 'lib/authz/components/AuthZTooltip/AuthZTooltip';
import { useUnloadPrompt } from '../hooks/useUnloadPrompt';
import styles from './Header.module.scss';
import type { BrandedPermission } from 'lib/authz/hooks/useAuthZ/types';
import type { PanelEditorCrumbs } from './breadcrumb';
import EditorBreadcrumb from './EditorBreadcrumb';

interface HeaderProps {
	/** Unsaved edits exist — shows the "Unsaved Changes" badge and gates the discard confirmation on close (not the Save button). */
	isDirty: boolean;
	isSaving: boolean;
	showSwitchToView?: boolean;
	/** Locked/no-permission dashboard — Save is disabled with a reason. */
	readOnly?: boolean;
	/** Present when saving is unavailable — the Save button explains itself with it. */
	readOnlyChecks?: BrandedPermission[];
	readOnlyTooltip?: string;
	onSave: () => void;
	onSwitchToView?: () => void;
	onClose: () => void;
	/** Where the panel lives: dashboard › section › panel. */
	crumbs?: PanelEditorCrumbs;
	/** The preview's time range and refresh, for kinds that query. */
	timePicker?: ReactNode;
}

function Header({
	isDirty,
	isSaving,
	showSwitchToView = false,
	readOnly = false,
	readOnlyChecks = [],
	readOnlyTooltip,
	onSave,
	onSwitchToView,
	onClose,
	crumbs,
	timePicker,
}: HeaderProps): JSX.Element {
	useUnloadPrompt(isDirty);

	const discard = useConfirmableAction(
		useCallback(async (): Promise<void> => {
			// Only reachable after confirming a discard, which is gated on unsaved edits.
			void logEvent(DashboardDetailEvents.PanelEditorDiscarded, {
				wasDirty: true,
			});
			onClose();
		}, [onClose]),
	);

	// Confirm before closing with unsaved edits; a pristine panel closes straight away.
	const handleCloseClick = useCallback((): void => {
		if (isDirty) {
			discard.request();
		} else {
			onClose();
		}
	}, [isDirty, onClose, discard]);

	return (
		<div className={styles.header}>
			<div className={styles.title}>
				<Button
					aria-label="Close"
					variant="ghost"
					color="secondary"
					size="sm"
					icon
					testId="panel-editor-v2-close"
					onClick={handleCloseClick}
				>
					<X size={14} />
				</Button>
				<Divider type="vertical" />
				<div className={styles.titleStack}>
					{crumbs && <EditorBreadcrumb crumbs={crumbs} />}
					<div className={styles.titleRow}>
						<h1 className={styles.titleText}>Configure panel</h1>
						{isDirty && (
							<Badge
								variant="solid"
								color="warning"
								testId="panel-editor-v2-unsaved-badge"
							>
								Unsaved Changes
							</Badge>
						)}
					</div>
				</div>
			</div>
			<div className={styles.actions}>
				{timePicker && (
					<div className={styles.timePicker} data-testid="panel-editor-time-picker">
						{timePicker}
					</div>
				)}
				<HeaderRightSection
					enableAnnouncements={false}
					enableShare={false}
					enableFeedback={false}
				/>
				<Divider type="vertical" />
				<Button
					size="sm"
					variant="ghost"
					color="secondary"
					testId="panel-editor-v2-discard"
					disabled={!isDirty}
					disabledTooltip="No unsaved changes"
					onClick={discard.request}
				>
					Discard
				</Button>
				{showSwitchToView && (
					<Button
						size="sm"
						variant="outlined"
						color="secondary"
						testId="panel-editor-v2-switch-to-view"
						onClick={onSwitchToView}
					>
						Switch to View Mode
					</Button>
				)}
				<AuthZTooltip
					checks={readOnlyChecks}
					disabledTooltip={readOnly ? readOnlyTooltip : undefined}
				>
					<Button
						disabledTooltip={undefined}
						size="sm"
						variant="solid"
						color="primary"
						testId="panel-editor-v2-save"
						disabled={readOnly}
						loading={!readOnly && isSaving}
						onClick={readOnly ? undefined : onSave}
					>
						Save changes
					</Button>
				</AuthZTooltip>
			</div>

			<DialogWrapper
				open={discard.open}
				onOpenChange={(next: boolean): void => {
					if (!next) {
						discard.cancel();
					}
				}}
				title="Discard changes?"
				titleIcon={<SolidAlertTriangle size={14} color="#fdd600" />}
				testId="panel-editor-v2-discard-modal"
				footer={
					<>
						<Button
							size="md"
							type="button"
							variant="solid"
							color="danger"
							testId="panel-editor-v2-discard-confirm"
							loading={discard.isPending}
							onClick={discard.confirm}
						>
							Discard
						</Button>
						<Button
							size="md"
							type="button"
							variant="outlined"
							color="secondary"
							testId="panel-editor-v2-discard-cancel"
							onClick={discard.cancel}
						>
							Keep editing
						</Button>
					</>
				}
			>
				<Typography>Your unsaved edits to this panel will be lost.</Typography>
			</DialogWrapper>
		</div>
	);
}

export default Header;
