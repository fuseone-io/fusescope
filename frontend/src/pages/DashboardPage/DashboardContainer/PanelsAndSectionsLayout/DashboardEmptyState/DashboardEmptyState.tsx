import { ReactNode } from 'react';
import { Button } from 'components/ui/button';
import { LayoutGrid, Plus, Settings2 } from 'lucide-react';

import { useCreatePanel } from '../../hooks/useCreatePanel';
import AuthZTooltip from 'lib/authz/components/AuthZTooltip/AuthZTooltip';
import { useDashboardStore } from '../../store/useDashboardStore';
import PanelTypeSelectionModal from '../Panel/PanelTypeSelectionModal/PanelTypeSelectionModal';
import styles from './DashboardEmptyState.module.scss';
import { useDashboardEditContext } from '../../hooks/useDashboardEditContext';

interface DashboardEmptyStateProps {
	canAddPanel: boolean;
}

interface StepProps {
	icon: ReactNode;
	title: string;
	info: string;
	action: ReactNode;
}

function Step({ icon, title, info, action }: StepProps): JSX.Element {
	return (
		<div className={styles.step}>
			<div className={styles.stepText}>
				<span aria-hidden="true" className={styles.stepIcon}>
					{icon}
				</span>
				<div className={styles.stepCopy}>
					<span className={styles.stepTitle}>{title}</span>
					<span className={styles.stepInfo}>{info}</span>
				</div>
			</div>
			{action}
		</div>
	);
}

function DashboardEmptyState({
	canAddPanel,
}: DashboardEmptyStateProps): JSX.Element {
	const { isEditable, editChecks, editDisabledTooltip } =
		useDashboardEditContext();
	const { isPickerOpen, openPicker, closePicker, createPanel } =
		useCreatePanel();
	const requestSettings = useDashboardStore((s) => s.requestSettings);

	return (
		<section className={`fs-ui ${styles.emptyState}`}>
			<div className={styles.content}>
				<div className={styles.heading}>
					<span aria-hidden="true" className={styles.headingIcon}>
						<LayoutGrid size={20} />
					</span>
					<h2 className={styles.welcome}>Welcome to your new dashboard</h2>
					<p className={styles.welcomeInfo}>
						Follow the steps to populate it with data and share with your teammates
					</p>
				</div>

				<div className={styles.steps}>
					<Step
						icon={<Settings2 size={16} />}
						title="Configure your new dashboard"
						info="Give it a name, add description, tags and variables"
						action={
							<AuthZTooltip checks={editChecks} disabledTooltip={editDisabledTooltip}>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={!isEditable}
									onClick={(): void => requestSettings({ tab: 'Overview' })}
									data-testid="empty-configure"
									className={styles.secondaryAction}
								>
									<Settings2 />
									Configure
								</Button>
							</AuthZTooltip>
						}
					/>
					<Step
						icon={<Plus size={16} />}
						title="Add panels"
						info="Add panels to visualize your data"
						action={
							<AuthZTooltip checks={editChecks} disabledTooltip={editDisabledTooltip}>
								<Button
									type="button"
									size="sm"
									disabled={!canAddPanel}
									onClick={(): void => openPicker()}
									data-testid="add-panel"
								>
									<Plus />
									New Panel
								</Button>
							</AuthZTooltip>
						}
					/>
				</div>
			</div>
			<PanelTypeSelectionModal
				open={isPickerOpen}
				onClose={closePicker}
				onSelect={createPanel}
			/>
		</section>
	);
}

export default DashboardEmptyState;
