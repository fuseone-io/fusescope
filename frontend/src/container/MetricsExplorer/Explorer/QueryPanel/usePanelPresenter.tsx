import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	FormulaPresentationArgs,
	QueryPresentationArgs,
	QueryPresenter,
} from 'components/QueryBuilderV2/QueryPresenterContext';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import {
	IBuilderFormula,
	IBuilderQuery,
} from 'types/api/queryBuilder/queryBuilderData';

import FormulaCard from './FormulaCard';
import QueryCard from './QueryCard';

type Snapshot = IBuilderQuery | IBuilderFormula;

/**
 * Cards for each query and formula, one open at a time: the first to begin
 * with, then whichever was last opened or added. Presentation only: state
 * changes come from the fields, or from Reset putting back what the card held
 * when it was last opened or shown.
 */
export function usePanelPresenter(): {
	presenter: QueryPresenter;
	/** Open just this one, collapsing the others. */
	focus: (name: string) => void;
	setAllOpen: (open: boolean) => void;
	isAnyOpen: boolean;
} {
	const { currentQuery, handleSetQueryData, handleSetFormulaData } =
		useQueryBuilder();
	const [resets, setResets] = useState<Record<string, number>>({});
	const snapshots = useRef(new Map<string, Snapshot>());

	const names = useMemo(
		() => [
			...currentQuery.builder.queryData.map((query) => query.queryName),
			...currentQuery.builder.queryFormulas.map((formula) => formula.queryName),
		],
		[currentQuery.builder.queryData, currentQuery.builder.queryFormulas],
	);

	const [openName, setOpenName] = useState<string | null>(names[0] ?? null);
	const known = useRef(new Set(names));

	useEffect(() => {
		const added = names.filter((name) => !known.current.has(name));
		known.current = new Set(names);
		if (added.length) {
			setOpenName(added[added.length - 1]);
		}
	}, [names]);

	const entities = useMemo(
		() =>
			new Map<string, Snapshot>(
				[
					...currentQuery.builder.queryData,
					...currentQuery.builder.queryFormulas,
				].map((item) => [item.queryName, item]),
			),
		[currentQuery.builder.queryData, currentQuery.builder.queryFormulas],
	);

	const open = useCallback(
		(name: string | null): void => {
			const current = name ? entities.get(name) : undefined;
			if (name && current) {
				snapshots.current.set(name, current);
			}
			setOpenName(name);
		},
		[entities],
	);

	const snapshotOf = (name: string, current: Snapshot): Snapshot => {
		if (!snapshots.current.has(name)) {
			snapshots.current.set(name, current);
		}
		return snapshots.current.get(name) as Snapshot;
	};

	const toggle = useCallback(
		(name: string): void => open(openName === name ? null : name),
		[open, openName],
	);

	const focus = useCallback((name: string): void => open(name), [open]);

	const setAllOpen = useCallback(
		(isOpen: boolean): void => open(isOpen ? (names[0] ?? null) : null),
		[open, names],
	);

	const bumpReset = useCallback((name: string): void => {
		setResets((prev) => ({ ...prev, [name]: (prev[name] ?? 0) + 1 }));
	}, []);

	const renderQuery = useCallback(
		({
			query,
			index,
			onToggleVisibility,
			actionsMenu,
		}: QueryPresentationArgs) => {
			const snapshot = snapshotOf(query.queryName, query);
			return (
				<QueryCard
					query={query}
					index={index}
					isOpen={openName === query.queryName}
					editorKey={resets[query.queryName] ?? 0}
					onToggleOpen={(): void => toggle(query.queryName)}
					onToggleVisibility={onToggleVisibility}
					actionsMenu={actionsMenu}
					onReset={(): void => {
						handleSetQueryData(index, snapshot as IBuilderQuery);
						bumpReset(query.queryName);
					}}
				/>
			);
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[openName, resets, toggle, handleSetQueryData, bumpReset],
	);

	const renderFormula = useCallback(
		({ formula, index }: FormulaPresentationArgs) => {
			const snapshot = snapshotOf(formula.queryName, formula);
			return (
				<FormulaCard
					formula={formula}
					query={
						currentQuery.builder.queryData[index] || currentQuery.builder.queryData[0]
					}
					index={index}
					isOpen={openName === formula.queryName}
					editorKey={resets[formula.queryName] ?? 0}
					onToggleOpen={(): void => toggle(formula.queryName)}
					onReset={(): void => {
						handleSetFormulaData(index, snapshot as IBuilderFormula);
						bumpReset(formula.queryName);
					}}
				/>
			);
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[
			openName,
			resets,
			toggle,
			handleSetFormulaData,
			bumpReset,
			currentQuery.builder.queryData,
		],
	);

	const presenter = useMemo(
		() => ({ renderQuery, renderFormula }),
		[renderQuery, renderFormula],
	);

	return {
		presenter,
		focus,
		setAllOpen,
		isAnyOpen: openName !== null && names.includes(openName),
	};
}
