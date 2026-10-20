import ROUTES from 'constants/routes';

const UNPADDED = new Set<string>([
	ROUTES.METRICS_EXPLORER_EXPLORER,
	ROUTES.METRICS_EXPLORER_VIEWS,
]);

/** The padding a tab's content gets; the Explorer and Views lay out their own. */
export const contentPadding = (pathname: string): string | undefined =>
	UNPADDED.has(pathname) ? undefined : 'tw:px-4 tw:py-4 tw:md:px-6';
