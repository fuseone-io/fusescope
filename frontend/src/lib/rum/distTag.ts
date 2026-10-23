/** npm dist-tag the app installs while the SDK and CLI are prerelease; empty once `latest` is current. */
export const RUM_DIST_TAG = 'next';

export const withDistTag = (pkg: string): string =>
	RUM_DIST_TAG ? `${pkg}@${RUM_DIST_TAG}` : pkg;
