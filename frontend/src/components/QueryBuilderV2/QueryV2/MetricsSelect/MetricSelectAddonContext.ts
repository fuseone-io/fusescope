// eslint-disable-next-line no-restricted-imports
import { createContext, ReactNode, useContext } from 'react';
import { IBuilderQuery } from 'types/api/queryBuilder/queryBuilderData';

/** Renders beside a metrics query's metric selector, e.g. a details shortcut. */
export type MetricSelectAddon = (query: IBuilderQuery) => ReactNode;

const MetricSelectAddonContext = createContext<MetricSelectAddon | null>(null);

export const MetricSelectAddonProvider = MetricSelectAddonContext.Provider;

export function useMetricSelectAddon(): MetricSelectAddon | null {
	return useContext(MetricSelectAddonContext);
}
