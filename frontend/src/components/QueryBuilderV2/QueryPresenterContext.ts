// eslint-disable-next-line no-restricted-imports
import { createContext, ReactNode, useContext } from 'react';
import {
	IBuilderFormula,
	IBuilderQuery,
} from 'types/api/queryBuilder/queryBuilderData';

export interface QueryPresentationArgs {
	query: IBuilderQuery;
	index: number;
	/** The builder's own editor for this query, unchanged. */
	editor: ReactNode;
	onToggleVisibility: () => void;
	/** The query's clone/delete menu, when the builder offers one. */
	actionsMenu: ReactNode;
}

export interface FormulaPresentationArgs {
	formula: IBuilderFormula;
	index: number;
	/** The builder's own editor for this formula, unchanged. */
	editor: ReactNode;
}

/**
 * Lets a page wrap how each query and formula is shown (e.g. collapsed to a
 * summary line) without touching their editors or state.
 */
export interface QueryPresenter {
	renderQuery: (args: QueryPresentationArgs) => ReactNode;
	renderFormula: (args: FormulaPresentationArgs) => ReactNode;
}

const QueryPresenterContext = createContext<QueryPresenter | null>(null);

export const QueryPresenterProvider = QueryPresenterContext.Provider;

export function useQueryPresenter(): QueryPresenter | null {
	return useContext(QueryPresenterContext);
}
