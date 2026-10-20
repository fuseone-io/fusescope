import {
	PointerEvent,
	ReactNode,
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import { Button } from 'components/ui/button';
import { cn } from 'lib/utils';
import { PanelLeftOpen } from 'lucide-react';

import QueryPanel, { QueryPanelProps } from './QueryPanel';
import { usePanelLayout } from './usePanelLayout';
import { usePanelPresenter } from './usePanelPresenter';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';

import './QueryPanel.styles.scss';

interface QuerySplitProps extends QueryPanelProps {
	/** The results pane. */
	children: ReactNode;
}

/**
 * Queries on the left, results on the right. The panel is resizable and
 * collapses to a rail of query letters; both are remembered.
 */
function QuerySplit({ children, ...panelProps }: QuerySplitProps): JSX.Element {
	const { currentQuery } = useQueryBuilder();
	const layout = usePanelLayout();
	const presenter = usePanelPresenter();
	const splitRef = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState<number>();

	// Fill the viewport down to the sticky toolbar; each pane scrolls itself.
	useLayoutEffect(() => {
		const compute = (): void => {
			const split = splitRef.current;
			if (!split) {
				return;
			}
			const toolbar = split.parentElement?.querySelector<HTMLElement>(
				'.explorer-options-container',
			);
			const available =
				window.innerHeight -
				split.getBoundingClientRect().top -
				(toolbar?.getBoundingClientRect().height ?? 0);
			if (available > 240) {
				setHeight(available);
			}
		};
		compute();
		window.addEventListener('resize', compute);
		return (): void => window.removeEventListener('resize', compute);
	}, []);

	const startResize = useCallback(
		(event: PointerEvent<HTMLButtonElement>): void => {
			const split = splitRef.current;
			if (!split) {
				return;
			}
			event.preventDefault();
			const { left, width } = split.getBoundingClientRect();
			const onMove = (move: globalThis.PointerEvent): void => {
				layout.setWidthPercent(((move.clientX - left) / width) * 100);
			};
			const onUp = (): void => {
				window.removeEventListener('pointermove', onMove);
				window.removeEventListener('pointerup', onUp);
			};
			window.addEventListener('pointermove', onMove);
			window.addEventListener('pointerup', onUp);
		},
		[layout],
	);

	const letters = [
		...currentQuery.builder.queryData.map((query) => ({
			name: query.queryName,
			isFormula: false,
		})),
		...currentQuery.builder.queryFormulas.map((formula) => ({
			name: formula.queryName,
			isFormula: true,
		})),
	];

	return (
		<div className="metrics-split" ref={splitRef} style={{ height }}>
			{layout.isCollapsed ? (
				<nav
					className="rail fs-ui"
					aria-label="Queries (collapsed)"
					data-testid="query-rail"
				>
					<Button
						variant="ghost"
						size="icon-sm"
						className="tw:text-muted-foreground"
						aria-label="Expand query panel"
						onClick={(): void => layout.setCollapsed(false)}
					>
						<PanelLeftOpen />
					</Button>
					{letters.map((letter) => (
						<button
							key={letter.name}
							type="button"
							className="rail-item"
							aria-label={`Open ${letter.name}`}
							onClick={(): void => {
								presenter.focus(letter.name);
								layout.setCollapsed(false);
							}}
						>
							<span className={cn('qa', letter.isFormula && 'f')}>{letter.name}</span>
						</button>
					))}
				</nav>
			) : (
				<section
					className="qpanel"
					aria-label="Query builder"
					data-testid="query-panel"
					style={{ flexBasis: `${layout.widthPercent}%` }}
				>
					<QueryPanel
						{...panelProps}
						presenter={presenter}
						onCollapse={(): void => layout.setCollapsed(true)}
					/>
					<button
						type="button"
						className="grip"
						aria-label="Resize query panel"
						title="Drag to resize, double-click for half"
						data-testid="query-panel-grip"
						onPointerDown={startResize}
						onDoubleClick={(): void => layout.setWidthPercent(50)}
					>
						<span />
						<span />
					</button>
				</section>
			)}
			<section className="results" aria-label="Results">
				{children}
			</section>
		</div>
	);
}

export default QuerySplit;
