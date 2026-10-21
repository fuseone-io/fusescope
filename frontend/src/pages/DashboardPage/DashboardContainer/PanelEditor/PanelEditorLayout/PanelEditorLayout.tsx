import {
	type PointerEvent,
	type ReactNode,
	useCallback,
	useMemo,
	useRef,
	useState,
} from 'react';
import { Button } from 'components/ui/button';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import {
	type PanelEditorChrome,
	PanelEditorChromeProvider,
} from './PanelEditorChromeContext';
import QueryRail from './QueryRail';
import { usePanelEditorLayout } from './usePanelEditorLayout';

import 'container/MetricsExplorer/Explorer/QueryPanel/QueryPanel.styles.scss';
import styles from '../PanelEditor.module.scss';

interface PanelEditorLayoutProps {
	/** Save/close chrome — its affordances differ per authoring mode. */
	header: ReactNode;
	/** Centre: what the panel will look like once saved. */
	preview: ReactNode;
	/** Left column: the kind's `EditorPane` — the query panel, or a static kind's own. */
	editor: ReactNode;
	/** Right column: the kind's config sections. */
	config: ReactNode;
	/**
	 * A query kind's editor brings its own header and queries; a static kind's
	 * pane is framed here under this title.
	 */
	mode: { type: 'query'; onRun: () => void } | { type: 'static'; title: string };
}

/**
 * The panel editor's frame: header, then queries on the left, the preview in the
 * middle and settings on the right. The side panes collapse to rails and the
 * query panel resizes; all of it is remembered per browser.
 */
function PanelEditorLayout({
	header,
	preview,
	editor,
	config,
	mode,
}: PanelEditorLayoutProps): JSX.Element {
	const { layout, setQueryWidth, setQueryCollapsed, setSettingsCollapsed } =
		usePanelEditorLayout();
	const [openQuery, setOpenQuery] = useState<string | null | undefined>();
	const bodyRef = useRef<HTMLDivElement>(null);

	const chrome = useMemo<PanelEditorChrome>(
		() => ({
			collapseQueryPanel: (): void => setQueryCollapsed(true),
			settingsCollapsed: layout.settingsCollapsed,
			setSettingsCollapsed,
			openQuery,
			setOpenQuery,
		}),
		[
			layout.settingsCollapsed,
			openQuery,
			setQueryCollapsed,
			setSettingsCollapsed,
		],
	);

	const startResize = useCallback(
		(event: PointerEvent<HTMLButtonElement>): void => {
			const body = bodyRef.current;
			if (!body) {
				return;
			}
			event.preventDefault();
			const { left } = body.getBoundingClientRect();
			const onMove = (move: globalThis.PointerEvent): void => {
				setQueryWidth(move.clientX - left);
			};
			const onUp = (): void => {
				window.removeEventListener('pointermove', onMove);
				window.removeEventListener('pointerup', onUp);
			};
			window.addEventListener('pointermove', onMove);
			window.addEventListener('pointerup', onUp);
		},
		[setQueryWidth],
	);

	const leftRail =
		mode.type === 'query' ? (
			<QueryRail
				onExpand={(): void => setQueryCollapsed(false)}
				onOpenQuery={(name): void => {
					setOpenQuery(name);
					setQueryCollapsed(false);
				}}
				onRun={mode.onRun}
			/>
		) : (
			<nav className="rail fs-ui" aria-label={`${mode.title} (collapsed)`}>
				<Button
					variant="ghost"
					size="icon-sm"
					className="tw:text-muted-foreground"
					aria-label={`Expand ${mode.title}`}
					onClick={(): void => setQueryCollapsed(false)}
				>
					<PanelLeftOpen />
				</Button>
			</nav>
		);

	return (
		<div className={styles.page} data-testid="panel-editor-v2">
			{header}
			<PanelEditorChromeProvider value={chrome}>
				<div className={`panel-query-cards ${styles.body}`} ref={bodyRef}>
					{layout.queryCollapsed ? (
						leftRail
					) : (
						<div
							className={styles.left}
							style={{ width: layout.queryWidth }}
							data-testid="panel-editor-left"
						>
							{mode.type === 'static' && (
								<div className="qpanel-h fs-ui">
									<div className="tw:flex tw:min-w-0 tw:items-center tw:gap-1.5">
										<Button
											variant="ghost"
											size="icon-sm"
											className="tw:text-muted-foreground"
											aria-label={`Collapse ${mode.title}`}
											onClick={(): void => setQueryCollapsed(true)}
										>
											<PanelLeftClose />
										</Button>
										<h2 className="tw:m-0 tw:text-sm tw:font-semibold tw:text-foreground">
											{mode.title}
										</h2>
									</div>
								</div>
							)}
							<div className={styles.leftContent}>{editor}</div>
							<button
								type="button"
								className="grip"
								aria-label="Resize query panel"
								title="Drag to resize"
								data-testid="panel-editor-grip"
								onPointerDown={startResize}
							>
								<span />
								<span />
							</button>
						</div>
					)}
					<div className={styles.center}>{preview}</div>
					<div
						className={layout.settingsCollapsed ? styles.rightRail : styles.right}
						data-testid="panel-editor-right"
					>
						{config}
					</div>
				</div>
			</PanelEditorChromeProvider>
		</div>
	);
}

export default PanelEditorLayout;
