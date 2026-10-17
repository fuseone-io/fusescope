// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { AppState } from 'store/reducers';
import AppReducer from 'types/reducer/app';
import { checkVersionState } from 'utils/app';

export interface VersionInfo {
	licenseTag: string;
	currentVersion: string;
	latestVersion: string;
	/** Self-hosted only: cloud is always current. */
	isUpdateAvailable: boolean;
}

export function useVersionInfo(): VersionInfo {
	const { currentVersion, latestVersion } = useSelector<AppState, AppReducer>(
		(state) => state.app,
	);
	const {
		isCloudUser,
		isEnterpriseSelfHostedUser,
		isCommunityEnterpriseUser,
		isCommunityUser,
	} = useGetTenantLicense();

	let licenseTag = '';
	if (isCloudUser) {
		licenseTag = 'Cloud';
	} else if (isEnterpriseSelfHostedUser) {
		licenseTag = 'Enterprise';
	} else if (isCommunityEnterpriseUser) {
		licenseTag = 'Free';
	} else if (isCommunityUser) {
		licenseTag = 'Community';
	}

	return {
		licenseTag,
		currentVersion,
		latestVersion,
		isUpdateAvailable:
			!isCloudUser && !checkVersionState(currentVersion, latestVersion),
	};
}
