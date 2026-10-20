import { useCallback, useMemo, useRef, useState } from 'react';
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
 * Cards for each query and formula, open unless collapsed (so new ones open).
 * Presentation only: state changes come from the fields, or from Reset putting
 * back what the card held when it was last opened or shown.
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
	const [closed, setClosed] = useState<Record<string, boolean>>({});
	const [resets, setResets] = useState<Record<string, number>>({});
	const snapshots = useRef(new Map<string, Snapshot>());

	const names = useMemo(
		() => [
			...currentQuery.builder.queryData.map((query) => query.queryName),
			...currentQuery.builder.queryFormulas.map((formula) => formula.queryName),
		],
		[currentQuery.builder.queryData, currentQuery.builder.queryFormulas],
	);

	const snapshotOf = (name: string, current: Snapshot): Snapshot => {
		if (!snapshots.current.has(name)) {
			snapshots.current.set(name, current);
		}
		return snapshots.current.get(name) as Snapshot;
	};

	const toggle = useCallback((name: string, current: Snapshot): void => {
		setClosed((prev) => {
			const willOpen = Boolean(prev[name]);
			if (willOpen) {
				snapshots.current.set(name, current);
			}
			return { ...prev, [name]: !willOpen };
		});
	}, []);

	const focus = useCallback(
		(name: string): void =>
			setClosed(Object.fromEntries(names.map((item) => [item, item !== name]))),
		[names],
	);

	const setAllOpen = useCallback(
		(open: boolean): void =>
			setClosed(Object.fromEntries(names.map((item) => [item, !open]))),
		[names],
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
					isOpen={!closed[query.queryName]}
					editorKey={resets[query.queryName] ?? 0}
					onToggleOpen={(): void => toggle(query.queryName, query)}
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
		[closed, resets, toggle, handleSetQueryData, bumpReset],
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
					isOpen={!closed[formula.queryName]}
					editorKey={resets[formula.queryName] ?? 0}
					onToggleOpen={(): void => toggle(formula.queryName, formula)}
					onReset={(): void => {
						handleSetFormulaData(index, snapshot as IBuilderFormula);
						bumpReset(formula.queryName);
					}}
				/>
			);
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[
			closed,
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
		isAnyOpen: names.some((name) => !closed[name]),
	};
}
