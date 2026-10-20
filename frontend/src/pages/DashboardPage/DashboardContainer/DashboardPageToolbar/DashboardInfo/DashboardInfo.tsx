import { type FocusEvent, KeyboardEvent } from 'react';
import { Check, Globe, LockKeyhole, LockKeyholeOpen, X } from 'lucide-react';
import TagChip from 'components/PageTemplate/components/TagChip';
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import { Button as LegacyButton } from '@signozhq/ui/button';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import logEvent from 'api/common/logEvent';
import cx from 'classnames';
import { isEmpty } from 'lodash-es';
import { DashboardDetailEvents } from 'pages/DashboardPage/constants/events';
import { linkifyText } from 'utils/linkifyText';
import { openInNewTab } from 'utils/navigation';

import styles from './DashboardInfo.module.scss';

import TagsOverflowTooltip from './TagsOverflowTooltip';
import { DASHBOARD_NAME_MAX_LENGTH } from '../../constants';
import { useDashboardStore } from '../../store/useDashboardStore';
import { useDashboardEditContext } from '../../hooks/useDashboardEditContext';

// The tag cluster keeps a fixed footprint so a long title ellipsizes around it
// instead of collapsing the tags: show up to two tags, then a `+N` overflow badge.
const MAX_VISIBLE_TAGS = 2;

interface DashboardInfoProps {
	title: string;
	image: string;
	tags: string[];
	description: string;
	isPublicDashboard: boolean;
	/** Absolute URL of the public dashboard page; opened when the globe is clicked. */
	publicUrl: string;
	isDashboardLocked: boolean;
	/** Whether to render the lock toggle at all (hidden for never-locked dashboards). */
	showLockToggle: boolean;
	/** When provided, the lock icon toggles lock/unlock (author/admin only). */
	onToggleLock?: () => void;
	/** Why the toggle is unavailable, when onToggleLock is absent. */
	lockDisabledTooltip?: string;
	isEditing: boolean;
	draft: string;
	onDraftChange: (value: string) => void;
	onStartEdit: () => void;
	onCommit: () => void;
	onCancel: () => void;
}

function DashboardInfo({
	title,
	image,
	tags,
	description,
	isPublicDashboard,
	publicUrl,
	isDashboardLocked,
	showLockToggle,
	onToggleLock,
	lockDisabledTooltip,
	isEditing,
	draft,
	onDraftChange,
	onStartEdit,
	onCommit,
	onCancel,
}: DashboardInfoProps): JSX.Element {
	const { isEditable: canEdit } = useDashboardEditContext();
	const dashboardId = useDashboardStore((s) => s.dashboardId);

	const hasTags = tags.length > 0;
	const hasDescription = !isEmpty(description);

	const visibleTags = tags.slice(0, MAX_VISIBLE_TAGS);
	const remainingTags = tags.slice(MAX_VISIBLE_TAGS);

	// Without a toggle, say why it can't be toggled rather than only restating the
	// lock state.
	let lockTooltip: string;
	if (onToggleLock) {
		lockTooltip = isDashboardLocked
			? 'Locked — click to unlock'
			: 'Unlocked — click to lock';
	} else if (lockDisabledTooltip) {
		lockTooltip = lockDisabledTooltip;
	} else {
		lockTooltip = isDashboardLocked
			? 'This dashboard is locked'
			: 'This dashboard is unlocked';
	}

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
		if (event.key === 'Enter') {
			event.preventDefault();
			onCommit();
		} else if (event.key === 'Escape') {
			onCancel();
		}
	};

	// Clicking outside the editor commits, matching the input's Enter behaviour.
	// Guard against blurs that move focus to the Save/Cancel buttons within it.
	const onEditorBlur = (event: FocusEvent<HTMLDivElement>): void => {
		if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
			onCommit();
		}
	};

	const handleOpenPublicUrl = (): void => {
		void logEvent(DashboardDetailEvents.PublicUrlOpened, {
			dashboardId,
			dashboardName: title,
		});
		openInNewTab(publicUrl);
	};

	return (
		<div className={styles.dashboardInfo}>
			<span className={styles.iconTile} aria-hidden="true">
				<img src={image} alt={title} className={styles.dashboardImage} />
			</span>

			<div className={styles.infoBody}>
				<div className={styles.titleRow}>
					{isEditing ? (
						<div className={styles.dashboardTitleEditor} onBlur={onEditorBlur}>
							<Input
								autoFocus
								value={draft}
								aria-label="Dashboard name"
								data-testid="dashboard-title-input"
								maxLength={DASHBOARD_NAME_MAX_LENGTH}
								className={`tw:h-8 tw:border-input tw:bg-surface-raised tw:text-base tw:font-semibold tw:dark:bg-surface-raised ${styles.dashboardTitleInput}`}
								onChange={(e): void => onDraftChange(e.target.value)}
								onKeyDown={onKeyDown}
							/>
							<Button
								type="button"
								size="icon-sm"
								aria-label="Save title"
								data-testid="dashboard-title-save"
								onClick={onCommit}
							>
								<Check />
							</Button>
							<Button
								type="button"
								variant="outline"
								size="icon-sm"
								aria-label="Cancel title edit"
								data-testid="dashboard-title-cancel"
								className="tw:border-input tw:bg-surface-raised tw:dark:bg-surface-raised"
								onClick={onCancel}
							>
								<X />
							</Button>
						</div>
					) : (
						<TitleTooltip title={title}>
							<h1
								className={cx(styles.dashboardTitle, {
									[styles.dashboardTitleHover]: canEdit,
								})}
								data-testid="dashboard-title"
								onClick={canEdit ? onStartEdit : undefined}
							>
								{title}
							</h1>
						</TitleTooltip>
					)}

					{isPublicDashboard && (
						<TitleTooltip title="This dashboard is publicly accessible. Click to open the public page.">
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label="Open public dashboard"
								data-testid="dashboard-public-link"
								className="tw:size-7 tw:text-primary-ink"
								onClick={handleOpenPublicUrl}
							>
								<Globe />
							</Button>
						</TitleTooltip>
					)}

					{showLockToggle && (
						<TitleTooltip title={onToggleLock ? lockTooltip : undefined}>
							<span className="tw:inline-flex">
								<LegacyButton
									disabledTooltip={lockTooltip}
									type="button"
									variant="ghost"
									color="secondary"
									size="sm"
									icon
									aria-label={isDashboardLocked ? 'Unlock dashboard' : 'Lock dashboard'}
									testId="dashboard-lock"
									disabled={!onToggleLock}
									onClick={onToggleLock}
								>
									{isDashboardLocked ? (
										<LockKeyhole size={14} />
									) : (
										<LockKeyholeOpen size={14} />
									)}
								</LegacyButton>
							</span>
						</TitleTooltip>
					)}

					{hasTags && (
						<div className={styles.dashboardTags} data-testid="dashboard-tags">
							{visibleTags.map((tag) => (
								<TagChip key={tag} title={tag}>
									{tag}
								</TagChip>
							))}
							{remainingTags.length > 0 && (
								<TitleTooltip title={<TagsOverflowTooltip tags={remainingTags} />}>
									<span data-testid="dashboard-tags-overflow" className="tw:inline-flex">
										<TagChip>+{remainingTags.length}</TagChip>
									</span>
								</TitleTooltip>
							)}
						</div>
					)}
				</div>

				{hasDescription && (
					<TitleTooltip
						side="bottom"
						title={
							<span className={styles.descriptionTooltip}>
								{linkifyText(description)}
							</span>
						}
					>
						<p
							className={styles.description}
							data-testid="dashboard-description-info"
						>
							{linkifyText(description)}
						</p>
					</TitleTooltip>
				)}
			</div>
		</div>
	);
}

export default DashboardInfo;
