import {
	type ChangeEvent,
	type ReactElement,
	useCallback,
	useState,
} from 'react';
import logEvent from 'api/common/logEvent';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import { Bookmark } from '@signozhq/icons';
import { PenLine, Plus, Search, Trash2 } from 'lucide-react';
import cx from 'classnames';

import { useDeleteConfirm } from 'components/DeleteConfirmModal/useDeleteConfirm';
import { DashboardListEvents } from 'pages/DashboardsListPage/constants/events';

import type { SavedView } from '../../types';
import { type BuiltinView } from '../../utils/views';
import ViewNamePopover from './ViewNamePopover';

import styles from './ViewsRail.module.scss';
import { AuthZGuardContent } from 'lib/authz/components/AuthZGuard/AuthZGuardContent';
import PermissionDeniedCallout from 'lib/authz/components/PermissionDeniedCallout/PermissionDeniedCallout';
import { LIST_CHECKS } from 'pages/DashboardsListPage/constants/permissions';

interface Props {
	activeViewId: string;
	builtinViews: BuiltinView[];
	customViews: SavedView[];
	customViewsLoading: boolean;
	isCustomActive: boolean;
	isModified: boolean;
	collapsed?: boolean;
	onSelect: (id: string) => void;
	onSave: (name: string) => void;
	onSaveChanges: () => void;
	onReset: () => void;
	onDelete: (id: string) => Promise<void>;
	onRename: (id: string, name: string) => void;
}

interface ViewRow {
	id: string;
	label: string;
	icon: BuiltinView['icon'];
	deletable?: boolean;
}

// Purely presentational — active view, dirty state, and handlers come from
// `useActiveView`.
function ViewsRail({
	activeViewId,
	builtinViews,
	customViews,
	customViewsLoading,
	isCustomActive,
	isModified,
	collapsed = false,
	onSelect,
	onSave,
	onSaveChanges,
	onReset,
	onDelete,
	onRename,
}: Props): JSX.Element {
	const [saveOpen, setSaveOpen] = useState(false);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [query, setQuery] = useState('');
	const { contextHolder, confirmDelete } = useDeleteConfirm();

	const q = query.trim().toLowerCase();
	const matchesQuery = (label: string): boolean =>
		!q || label.toLowerCase().includes(q);

	const personal = builtinViews.filter(
		(v) => v.section === 'personal' && matchesQuery(v.label),
	);
	const system = builtinViews.filter(
		(v) => v.section === 'system' && matchesQuery(v.label),
	);
	const custom = customViews.filter((v) => matchesQuery(v.name));
	const noMatches =
		!!q && personal.length === 0 && system.length === 0 && custom.length === 0;

	const onConfirmDelete = useCallback(
		(id: string, label: string): void => {
			confirmDelete({
				title: (
					<span className={styles.deleteTitle}>
						Delete the <span className={styles.deleteName}>{label}</span> view?
					</span>
				),
				content: 'This removes the saved view. Your dashboards are not affected.',
				// Return the delete promise so the modal's Delete button stays loading
				// until the backend call settles, then closes — matching dashboard delete.
				onConfirm: (): Promise<void> => {
					void logEvent(DashboardListEvents.ViewDeleted, {});
					return onDelete(id);
				},
			});
		},
		[confirmDelete, onDelete],
	);

	const handleSaveAsView = (name: string): void => {
		void logEvent(DashboardListEvents.ViewSaved, { mode: 'new' });
		onSave(name);
	};

	const handleSaveViewChanges = (): void => {
		void logEvent(DashboardListEvents.ViewSaved, { mode: 'update' });
		onSaveChanges();
	};

	const renderItem = (row: ViewRow): JSX.Element => {
		const Icon = row.icon;
		const active = row.id === activeViewId;
		return (
			<div key={row.id} className={cx(styles.row, { [styles.rowActive]: active })}>
				<button
					type="button"
					className={styles.rowButton}
					aria-current={active ? 'true' : undefined}
					data-testid={`dashboards-view-${row.id}`}
					onClick={(): void => onSelect(row.id)}
				>
					<Icon size={16} className={styles.itemIcon} />
					<span className={styles.rowLabel}>{row.label}</span>
					{active && isModified && (
						<span className={styles.dirtyDot} title="Unsaved changes" />
					)}
				</button>
				{row.deletable && (
					<div className={styles.itemActions}>
						<ViewNamePopover
							open={renamingId === row.id}
							onOpenChange={(open): void => setRenamingId(open ? row.id : null)}
							onSubmit={(name): void => {
								void logEvent(DashboardListEvents.ViewRenamed, {});
								onRename(row.id, name);
							}}
							title="Rename view"
							confirmLabel="Rename"
							initialName={row.label}
							testIdPrefix="rename-view"
							tooltip="Rename view"
							trigger={
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label="Rename view"
									className={styles.itemAction}
									onClick={(e): void => e.stopPropagation()}
								>
									<PenLine />
								</Button>
							}
						/>
						<TitleTooltip title="Delete view">
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								aria-label="Delete view"
								className={styles.itemAction}
								onClick={(e): void => {
									e.stopPropagation();
									onConfirmDelete(row.id, row.label);
								}}
							>
								<Trash2 />
							</Button>
						</TitleTooltip>
					</div>
				)}
			</div>
		);
	};

	return (
		<aside className={cx(styles.rail, { [styles.collapsed]: collapsed })}>
			<AuthZGuardContent
				checks={LIST_CHECKS}
				onFailRenderContent={false}
				fallback={({ deniedPermissions }): ReactElement => (
					<div className={styles.denied} data-testid="views-rail-denied">
						<PermissionDeniedCallout deniedPermissions={deniedPermissions} />
					</div>
				)}
			>
				<>
					<div className={styles.header}>
						<h4 className={styles.headerTitle}>Views</h4>
						<ViewNamePopover
							open={saveOpen}
							onOpenChange={setSaveOpen}
							onSubmit={handleSaveAsView}
							title="Save as view"
							confirmLabel="Save view"
							testIdPrefix="save-view"
							tooltip="Save current filters as a view"
							trigger={
								<Button
									type="button"
									aria-label="Save current filters as a view"
									variant="ghost"
									size="icon-sm"
									data-testid="dashboards-view-save-trigger"
									className="tw:size-7 tw:text-muted-foreground"
								>
									<Plus />
								</Button>
							}
						/>
					</div>

					<div className={cx('fs-ui', styles.search)}>
						<Search aria-hidden="true" className={styles.searchIcon} />
						<Input
							value={query}
							placeholder="Filter views by name"
							aria-label="Filter views by name"
							data-testid="dashboards-view-search"
							className="tw:h-8 tw:rounded-lg tw:border-input tw:bg-surface-raised tw:pl-8 tw:font-sans tw:text-[13px] tw:dark:bg-surface-raised"
							onChange={(e: ChangeEvent<HTMLInputElement>): void =>
								setQuery(e.target.value)
							}
						/>
					</div>

					<div className={styles.scroll}>
						{personal.length > 0 && (
							<>
								<div className={styles.groupLabel}>Personal</div>
								{personal.map((v) => renderItem(v))}
							</>
						)}

						{system.length > 0 && (
							<>
								<div className={cx(styles.groupLabel, styles.groupLabelSpaced)}>
									System
								</div>
								{system.map((v) => renderItem(v))}
							</>
						)}

						{(!q || custom.length > 0) && (
							<>
								<div className={cx(styles.groupLabel, styles.groupLabelSpaced)}>
									My views
									<span className={styles.groupCount}>{customViews.length}</span>
								</div>
								{customViewsLoading ? (
									<div className={styles.empty}>Loading views…</div>
								) : customViews.length === 0 ? (
									<div className={styles.empty}>
										No saved views yet. Filter the list, then save it as a view.
									</div>
								) : (
									custom.map((v) =>
										renderItem({
											id: v.id,
											label: v.name,
											icon: Bookmark,
											deletable: true,
										}),
									)
								)}
							</>
						)}

						{noMatches && (
							<div className={styles.searchEmpty}>
								No views match &ldquo;{query}&rdquo;
							</div>
						)}
					</div>

					{isCustomActive && isModified && (
						<div className={cx('fs-ui', styles.dirtyPanel)}>
							<div className={styles.dirtyTitle}>Unsaved changes</div>
							<div className={styles.dirtyActions}>
								<Button
									type="button"
									size="sm"
									onClick={handleSaveViewChanges}
									data-testid="dashboards-view-save-changes"
								>
									Save
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className={styles.secondaryAction}
									onClick={(): void => setSaveOpen(true)}
								>
									Save as…
								</Button>
								<Button type="button" variant="ghost" size="sm" onClick={onReset}>
									Reset
								</Button>
							</div>
						</div>
					)}

					{!isCustomActive && isModified && (
						<div className={cx('fs-ui', styles.dirtyPanel, styles.dirtyPanelDefault)}>
							<div className={styles.dirtyTitle}>Filters active</div>
							<div className={styles.dirtyActions}>
								<Button
									type="button"
									size="sm"
									onClick={(): void => setSaveOpen(true)}
									data-testid="dashboards-view-save-as-new"
								>
									<Plus />
									Save as new view
								</Button>
								<Button type="button" variant="ghost" size="sm" onClick={onReset}>
									Reset
								</Button>
							</div>
						</div>
					)}
					{contextHolder}
				</>
			</AuthZGuardContent>
		</aside>
	);
}

export default ViewsRail;
