import { useCallback } from 'react';
import logEvent from 'api/common/logEvent';
import ROUTES from 'constants/routes';
import history from 'lib/history';
import { useAppContext } from 'providers/App/App';
import { LicensePlatform } from 'types/api/licensesV3/getActive';
import { openInNewTab } from 'utils/navigation';

import { DOCS_LINKS } from '../constants';

/** Cloud workspaces open the onboarding flow; self-hosted ones the docs. */
export function useConnectDataSource(): () => void {
	const { activeLicense } = useAppContext();

	return useCallback((): void => {
		void logEvent('Homepage: Connect dataSource clicked', {});

		if (activeLicense && activeLicense.platform === LicensePlatform.CLOUD) {
			history.push(ROUTES.GET_STARTED_WITH_CLOUD);
		} else {
			openInNewTab(DOCS_LINKS.ADD_DATA_SOURCE);
		}
	}, [activeLicense]);
}
