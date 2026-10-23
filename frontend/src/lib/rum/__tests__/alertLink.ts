import { QueryParams } from 'constants/query';
import { IBuilderQuery } from 'types/api/queryBuilder/queryBuilderData';

import { rumAlertTemplateFromUrl } from '../alertTemplates';
import { RumAlertTemplateRef } from '../alertTemplateTypes';

interface AlertLink extends Partial<RumAlertTemplateRef> {
	ruleName: string | null;
	filters: string[];
	groupBy: string[][];
}

/** What an alert editor link declares, without its generated ids. */
export function alertLink(element: HTMLElement): AlertLink {
	const params = new URL(element.getAttribute('href') ?? '', 'http://x')
		.searchParams;
	const queryData: IBuilderQuery[] = JSON.parse(
		decodeURIComponent(params.get(QueryParams.compositeQuery) ?? '{}'),
	).builder.queryData;
	return {
		...rumAlertTemplateFromUrl(params),
		ruleName: params.get(QueryParams.ruleName),
		filters: queryData.map((query) => query.filter?.expression ?? ''),
		groupBy: queryData.map((query) => query.groupBy.map((key) => key.key)),
	};
}
