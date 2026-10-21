import { PersistedAnnouncementBanner } from '@signozhq/ui/announcement-banner';

import { fuseScopeDocsUrl } from 'constants/docs';

import styles from './NoAuthBanner.module.scss';

export function NoAuthBanner(): JSX.Element {
	return (
		<PersistedAnnouncementBanner
			type="warning"
			storageKey="no-auth-banner-v1"
			testId="no-auth-banner"
			className={styles.banner}
		>
			Impersonation mode: authentication is disabled. Anyone with access to this
			instance has admin privileges.{' '}
			<a
				href={fuseScopeDocsUrl('/configuration/impersonation-mode/')}
				target="_blank"
				rel="noreferrer"
			>
				Learn more
			</a>
		</PersistedAnnouncementBanner>
	);
}

export default NoAuthBanner;
