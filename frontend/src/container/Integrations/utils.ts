import {
	FUSESCOPE_NEW_ISSUE_URL,
	FUSESCOPE_REPO_URL,
} from 'components/AppSidebar/constants';
import history from 'lib/history';
import { openInNewTab } from 'utils/navigation';

export const handleContactSupport = (isCloudUser: boolean): void => {
	if (isCloudUser) {
		history.push('/support');
	} else {
		openInNewTab(FUSESCOPE_NEW_ISSUE_URL);
	}
};

/** A new issue on the FuseScope repo from the integration request template. */
export function integrationRequestIssueUrl(integrationName: string): string {
	const title = encodeURIComponent(
		`[Integration Request] ${integrationName.trim()}`,
	);
	return `${FUSESCOPE_REPO_URL}/issues/new?template=request_integration.md&title=${title}`;
}
