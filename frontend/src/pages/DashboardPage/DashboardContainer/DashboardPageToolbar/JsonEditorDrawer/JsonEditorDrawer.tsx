import { KeyboardEvent, useCallback } from 'react';
import MEditor from '@monaco-editor/react';
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import { Button } from 'components/ui/button';
import { cn } from 'lib/utils';
import { Loader2, TriangleAlert } from 'lucide-react';
import logEvent from 'api/common/logEvent';
import type { DashboardtypesGettableDashboardV2DTO } from 'api/generated/services/fuseScope.schemas';
import { DashboardDetailEvents } from 'pages/DashboardPage/constants/events';
import { useCopyToClipboard } from 'react-use';
import { toast } from '@signozhq/ui/sonner';

import { defineJsonEditorTheme, JSON_EDITOR_THEME } from './editorTheme';
import JsonEditorToolbar from './JsonEditorToolbar';
import { useJsonEditor } from './useJsonEditor';
import AuthZTooltip from 'lib/authz/components/AuthZTooltip/AuthZTooltip';
import { useDashboardEditContext } from '../../hooks/useDashboardEditContext';
import {
	BADGE_ERROR,
	BADGE_SUCCESS,
	BUTTON_GHOST,
	BUTTON_SM,
} from '../../DashboardSettings/components/settingsClassNames';
import DisabledReason from '../../DashboardSettings/components/DisabledReason';
import SettingsSheetFooter from '../../DashboardSettings/components/SettingsSheetFooter';
import SettingsDrawer from '../SettingsDrawer';

interface JsonEditorDrawerProps {
	dashboard: DashboardtypesGettableDashboardV2DTO;
	isOpen: boolean;
	onClose: () => void;
}

function JsonEditorDrawer({
	dashboard,
	isOpen,
	onClose,
}: JsonEditorDrawerProps): JSX.Element {
	const {
		isEditable,
		editDisabledTooltip: readOnlyTooltip,
		editChecks: readOnlyChecks,
	} = useDashboardEditContext();
	const [, copyToClipboard] = useCopyToClipboard();

	// Inspect-only when not editable: Apply/Format/Reset disabled.
	const readOnly = !isEditable;

	const {
		draft,
		setDraft,
		validity,
		isDirty,
		isSaving,
		danglingPanelIds,
		missingPanelRefs,
		format,
		reset,
		apply,
	} = useJsonEditor({ dashboard, isOpen, readOnly, onApplied: onClose });

	const onCopy = useCallback((): void => {
		copyToClipboard(draft);
		toast.success('JSON copied to clipboard');
		void logEvent(DashboardDetailEvents.JsonEditorAction, {
			action: 'copy',
			dashboardId: dashboard.id,
		});
	}, [copyToClipboard, draft, dashboard.id]);

	const onDownload = useCallback((): void => {
		void logEvent(DashboardDetailEvents.JsonEditorAction, {
			action: 'download',
			dashboardId: dashboard.id,
		});
		const blob = new Blob([draft], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${dashboard.name || 'dashboard'}.json`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}, [draft, dashboard.name, dashboard.id]);

	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>): void => {
			event.stopPropagation();

			if (event.key === 'Escape') {
				onClose();
				return;
			}

			if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
				event.preventDefault();
				if (!readOnly) {
					void apply();
				}
			}
		},
		[apply, readOnly, onClose],
	);

	const applyDisabled = readOnly || !isDirty || !validity.valid;
	let applyDisabledReason: string | undefined;
	if (!readOnly && !isDirty) {
		applyDisabledReason = 'No changes to apply';
	} else if (!readOnly && !validity.valid) {
		applyDisabledReason = 'Fix the JSON errors first';
	}
	const validationText = validity.valid
		? `Valid JSON · ${validity.lineCount} lines`
		: `Line ${validity.errorLine ?? '?'} · ${validity.message ?? 'Invalid JSON'}`;
	const plural = (n: number): string => (n === 1 ? '' : 's');
	const danglingWarning =
		danglingPanelIds.length > 0
			? `${danglingPanelIds.length} panel${plural(
					danglingPanelIds.length,
				)} not present in layout — they won't be shown after saving.`
			: null;
	const missingRefWarning =
		missingPanelRefs.length > 0
			? `${missingPanelRefs.length} layout item${plural(
					missingPanelRefs.length,
				)} ${missingPanelRefs.length === 1 ? 'references' : 'reference'} a panel that no longer exists.`
			: null;

	const warnings = [
		{
			text: danglingWarning,
			ids: danglingPanelIds,
			testId: 'json-editor-dangling-warning',
		},
		{
			text: missingRefWarning,
			ids: missingPanelRefs,
			testId: 'json-editor-missing-ref-warning',
		},
	];

	return (
		<SettingsDrawer
			drawerTitle="Dashboard JSON"
			subtitle={dashboard.spec?.display?.name || dashboard.name}
			testId="json-editor-sheet"
			isOpen={isOpen}
			onClose={onClose}
		>
			{/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
			<div
				className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col"
				onKeyDown={onKeyDown}
			>
				<JsonEditorToolbar
					isDirty={isDirty}
					readOnly={readOnly}
					onFormat={format}
					onCopy={onCopy}
					onDownload={onDownload}
					onReset={reset}
				/>
				<div className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-2.5 tw:px-6 tw:py-4">
					<div className="tw:min-h-0 tw:flex-1 tw:overflow-hidden tw:rounded-lg tw:border tw:border-border">
						<MEditor
							language="json"
							height="100%"
							value={draft}
							onChange={(value): void => setDraft(value ?? '')}
							options={{
								readOnly,
								scrollbar: { alwaysConsumeMouseWheel: false },
								minimap: { enabled: false },
								fontSize: 13,
								fontFamily: 'Space Mono',
							}}
							theme="vs-dark"
							onMount={(editor, monaco): void => {
								defineJsonEditorTheme(monaco, editor.getContainerDomNode());
								monaco.editor.setTheme(JSON_EDITOR_THEME);
								void document.fonts.ready.then(() => monaco.editor.remeasureFonts());
							}}
						/>
					</div>
					<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5">
						<span
							className={cn(
								validity.valid ? BADGE_SUCCESS : BADGE_ERROR,
								'tw:max-w-full tw:self-start tw:font-mono',
							)}
							data-testid="json-editor-validation"
						>
							<span className="tw:truncate">{validationText}</span>
						</span>
						{warnings.map(({ text, ids, testId }) =>
							text ? (
								<TitleTooltip key={testId} title={ids.join(', ')}>
									<span
										className="tw:flex tw:min-w-0 tw:items-center tw:gap-1.5 tw:self-start tw:text-xs tw:text-warning-ink"
										data-testid={testId}
									>
										<TriangleAlert
											className="tw:size-3.5 tw:flex-none tw:text-warning"
											aria-hidden="true"
										/>
										<span className="tw:truncate">{text}</span>
									</span>
								</TitleTooltip>
							) : null,
						)}
					</div>
				</div>
				<SettingsSheetFooter
					status={
						readOnly ? null : (
							<span className="tw:text-xs tw:text-subtle-foreground">
								Apply with{' '}
								<kbd className="tw:rounded tw:border tw:border-border tw:px-1.5 tw:py-px tw:font-mono tw:text-[11px] tw:text-subtle-foreground">
									⌘↵
								</kbd>
							</span>
						)
					}
				>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className={BUTTON_GHOST}
						data-testid="json-editor-cancel"
						onClick={onClose}
					>
						Cancel
					</Button>
					<DisabledReason reason={applyDisabledReason}>
						<AuthZTooltip
							checks={readOnlyChecks}
							disabledTooltip={readOnly ? readOnlyTooltip : undefined}
						>
							<Button
								type="button"
								size="sm"
								className={cn(BUTTON_SM, 'tw:hover:bg-primary-strong')}
								data-testid="json-editor-apply"
								disabled={applyDisabled || isSaving}
								aria-disabled={applyDisabled || isSaving || undefined}
								onClick={readOnly ? undefined : (): void => void apply()}
							>
								{isSaving && <Loader2 className="tw:animate-spin" aria-hidden="true" />}
								<span>Apply changes</span>
							</Button>
						</AuthZTooltip>
					</DisabledReason>
				</SettingsSheetFooter>
			</div>
		</SettingsDrawer>
	);
}

export default JsonEditorDrawer;
