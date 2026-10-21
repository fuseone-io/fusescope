import { useCallback, useEffect, useMemo, useRef } from 'react';
import type {
	FormulaPresentationArgs,
	QueryPresentationArgs,
	QueryPresenter,
} from 'components/QueryBuilderV2/QueryPresenterContext';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';

import type { PanelEditorChrome } from '../../PanelEditorLayout/PanelEditorChromeContext';
import PanelFormulaCard from './PanelFormulaCard';
import PanelQueryCard from './PanelQueryCard';

/**
 * Cards for each query and formula, one open at a time: the first to begin
 * with, then whichever was last opened or added. The open card lives in the
 * editor's frame so the collapsed rail can open one.
 */
export function usePanelQueryPresenter({
	openQuery,
	setOpenQuery,
}: Pick<PanelEditorChrome, 'openQuery' | 'setOpenQuery'>): QueryPresenter {
	const { currentQuery } = useQueryBuilder();

	const names = useMemo(
		() => [
			...currentQuery.builder.queryData.map((query) => query.queryName),
			...currentQuery.builder.queryFormulas.map((formula) => formula.queryName),
		],
		[currentQuery.builder.queryData, currentQuery.builder.queryFormulas],
	);

	const openName = openQuery === undefined ? (names[0] ?? null) : openQuery;
	const known = useRef(new Set(names));

	useEffect(() => {
		const added = names.filter((name) => !known.current.has(name));
		known.current = new Set(names);
		if (added.length) {
			setOpenQuery(added[added.length - 1]);
		}
	}, [names, setOpenQuery]);

	const toggle = useCallback(
		(name: string): void => setOpenQuery(openName === name ? null : name),
		[openName, setOpenQuery],
	);

	const renderQuery = useCallback(
		({
			query,
			parts,
			onToggleVisibility,
			canToggleVisibility,
			actionsMenu,
		}: QueryPresentationArgs) => (
			<PanelQueryCard
				query={query}
				parts={parts}
				onToggleVisibility={onToggleVisibility}
				canToggleVisibility={canToggleVisibility}
				actionsMenu={actionsMenu}
				isOpen={openName === query.queryName}
				onToggleOpen={(): void => toggle(query.queryName)}
			/>
		),
		[openName, toggle],
	);

	const renderFormula = useCallback(
		({ formula, index, editor }: FormulaPresentationArgs) => (
			<PanelFormulaCard
				formula={formula}
				index={index}
				editor={editor}
				isOpen={openName === formula.queryName}
				onToggleOpen={(): void => toggle(formula.queryName)}
			/>
		),
		[openName, toggle],
	);

	return useMemo(
		() => ({ renderQuery, renderFormula }),
		[renderQuery, renderFormula],
	);
}
