export interface CrumbContext {
	params: Record<string, string | undefined>;
	/** From the page's react-query cache; undefined until the page loads it. */
	dashboardName?: string;
	/** From the page's react-query cache, or the cloud provider's name. */
	integrationTitle?: string;
}

export interface CrumbRoute {
	label: string | ((context: CrumbContext) => string);
	/** Route template of the previous crumb; params carry over from the child. */
	parent?: string;
	/** Entity names (services, ids) render in mono. */
	mono?: boolean;
}

export interface Crumb {
	key: string;
	label: string;
	path: string;
	mono: boolean;
}

export type CrumbNames = Pick<
	CrumbContext,
	'dashboardName' | 'integrationTitle'
>;
