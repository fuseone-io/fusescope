import { type MouseEvent, useCallback, useMemo, useRef } from 'react';
import {
	autocompletion,
	closeCompletion,
	completionKeymap,
	startCompletion,
} from '@codemirror/autocomplete';
import cx from 'classnames';
import { Button } from 'components/ui/button';
import { Search } from 'lucide-react';
import CodeMirror, {
	EditorView,
	keymap,
	Prec,
	type ReactCodeMirrorRef,
} from '@uiw/react-codemirror';
import logEvent from 'api/common/logEvent';
import { DashboardListEvents } from 'pages/DashboardsListPage/constants/events';
import { getUserOperatingSystem, UserOperatingSystem } from 'utils/getUserOS';

import type { SuggestionSource } from '../../utils/dslSuggestions';
import { dslCompletionSource } from './dslCompletions';
import { dslHighlight } from './dslHighlight';

import styles from './SearchBar.module.scss';

interface Props {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	placeholder?: string;
	source?: SuggestionSource;
	// The draft differs from the last-run query — shows a "run to apply" hint.
	dirty?: boolean;
	/** Filtering needs `list`: the draft edits a query that cannot be run. */
	disabled?: boolean;
}

const EMPTY_SOURCE: SuggestionSource = {
	tagKeys: [],
	tagValuesByKey: {},
	creatorEmails: [],
};

// Token colours come from `.cm-dsl-*` classes (SearchBar.module.scss); this only
// handles layout — transparent background, monospace, single line.
const editorTheme = EditorView.theme({
	'&': { fontSize: '13px', backgroundColor: 'transparent' },
	'&.cm-focused': { outline: 'none' },
	'.cm-content': {
		// Leave room for the overlaid lead icon (left) and shortcut hint (right).
		padding: '8px 56px 8px 34px',
		fontFamily:
			"'JetBrains Mono', 'Fira Code', Consolas, ui-monospace, monospace",
		fontSize: '12px',
		color: 'var(--fs-foreground)',
		caretColor: 'var(--fs-foreground)',
	},
	'.cm-line': { padding: '0' },
	'.cm-scroller': { fontFamily: 'inherit', lineHeight: '18px' },
	'.cm-placeholder': { color: 'var(--fs-subtle-foreground)' },
});

const BASIC_SETUP = {
	lineNumbers: false,
	foldGutter: false,
	highlightActiveLine: false,
	highlightActiveLineGutter: false,
	highlightSelectionMatches: false,
	bracketMatching: false,
	closeBrackets: false,
	autocompletion: false,
	// Use the browser's native caret so it blinks (a CM-drawn cursor needs extra
	// styling and doesn't blink by default).
	drawSelection: false,
} as const;

function SearchBar({
	value,
	onChange,
	onSubmit,
	placeholder = "Filter with DSL (e.g. name CONTAINS 'foo')",
	source = EMPTY_SOURCE,
	dirty = false,
	disabled = false,
}: Props): JSX.Element {
	const isMac = getUserOperatingSystem() === UserOperatingSystem.MACOS;
	const editorRef = useRef<ReactCodeMirrorRef>(null);

	// Refs so the (memoised, stable) extensions always see the latest values.
	const sourceRef = useRef(source);
	sourceRef.current = source;
	const handleSubmit = useCallback((): void => {
		void logEvent(DashboardListEvents.SearchExecuted, {
			hasQuery: !!value.trim(),
		});
		onSubmit();
	}, [onSubmit, value]);
	const onSubmitRef = useRef(handleSubmit);
	onSubmitRef.current = handleSubmit;

	const extensions = useMemo(
		() => [
			dslHighlight,
			editorTheme,
			// Wrap a long query onto the next line instead of scrolling horizontally.
			EditorView.lineWrapping,
			// Read-only is not enough: these open the list on click and accepting an
			// option writes to the document, so a disabled box must not carry them.
			...(disabled
				? []
				: [
						autocompletion({
							override: [dslCompletionSource(() => sourceRef.current)],
							closeOnBlur: true,
							activateOnTyping: true,
							maxRenderedOptions: 100,
							icons: false,
						}),
						// Open the suggestions on focus/click (not only while typing), so a
						// click into the box immediately shows the key list.
						EditorView.domEventHandlers({
							focus: (_event, view): boolean => {
								startCompletion(view);
								return false;
							},
							click: (_event, view): boolean => {
								startCompletion(view);
								return false;
							},
						}),
					]),
			Prec.highest(
				keymap.of([
					...(disabled ? [] : completionKeymap),
					{ key: 'Escape', run: closeCompletion },
					// Enter accepts an open suggestion (via completionKeymap above); with
					// none open it is a no-op — it never runs the query or inserts a newline.
					{ key: 'Enter', preventDefault: true, run: (): boolean => true },
					{ key: 'Shift-Enter', preventDefault: true, run: (): boolean => true },
					{
						key: 'Mod-Enter',
						preventDefault: true,
						run: (): boolean => {
							onSubmitRef.current();
							return true;
						},
					},
				]),
			),
		],
		[disabled],
	);

	return (
		<div className={styles.wrapper}>
			<div className={cx(styles.field, { [styles.disabled]: disabled })}>
				<Search aria-hidden="true" className={styles.leadIcon} />
				<CodeMirror
					ref={editorRef}
					className={styles.editor}
					value={value}
					placeholder={placeholder}
					extensions={extensions}
					basicSetup={BASIC_SETUP}
					indentWithTab={false}
					editable={!disabled}
					data-testid="dashboards-list-search"
					onChange={(next): void => onChange(next.replace(/\n/g, ' '))}
				/>
				<kbd className={styles.cmdHint} aria-hidden="true">
					{isMac ? '⌘↵' : 'Ctrl ↵'}
				</kbd>
			</div>
			<span
				className="fs-ui tw:flex-none"
				onMouseDown={(e: MouseEvent<HTMLSpanElement>): void => e.preventDefault()}
			>
				<Button
					type="button"
					variant="outline"
					aria-label="Run search"
					aria-disabled={disabled || undefined}
					disabled={disabled}
					data-testid="dashboards-list-search-submit"
					className="tw:h-9 tw:rounded-lg tw:border-input tw:bg-surface-raised tw:font-sans tw:shadow-xs tw:dark:bg-surface-raised"
					onClick={handleSubmit}
				>
					{dirty && (
						<span
							className={styles.dirtyDot}
							data-testid="dashboards-list-search-dirty"
						/>
					)}
					<span>Run query</span>
				</Button>
			</span>
		</div>
	);
}

export default SearchBar;
