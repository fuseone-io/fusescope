// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { AppState } from 'store/reducers';
import AppReducer from 'types/reducer/app';
import { checkVersionState } from 'utils/app';

export interface VersionInfo {
	currentVersion: string;
	latestVersion: string;
	/** Self-hosted only: cloud is always current. */
	isUpdateAvailable: boolean;
}

export function useVersionInfo(): VersionInfo {
	const { currentVersion, latestVersion } = useSelector<AppState, AppReducer>(
		(state) => state.app,
	);
	const { isCloudUser } = useGetTenantLicense();

	return {
		currentVersion,
		latestVersion,
		isUpdateAvailable:
			!isCloudUser && !checkVersionState(currentVersion, latestVersion),
	};
}
