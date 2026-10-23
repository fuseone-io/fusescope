import { useCallback } from 'react';
import logEvent from 'api/common/logEvent';
import ROUTES from 'constants/routes';
import history from 'lib/history';

/** Opens the Get started catalog. */
export function useConnectDataSource(): () => void {
	return useCallback((): void => {
		void logEvent('Homepage: Connect dataSource clicked', {});
		history.push(ROUTES.GET_STARTED);
	}, []);
}
