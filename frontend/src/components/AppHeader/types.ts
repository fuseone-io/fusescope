export interface CrumbContext {
	params: Record<string, string | undefined>;
	/** From the page's react-query cache; undefined until the page loads it. */
	dashboardName?: string;
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
