import { useCallback, useState } from 'react';
import getLocalStorageKey from 'api/browser/localstorage/get';
import setLocalStorageKey from 'api/browser/localstorage/set';

/** Whether an explorer's filter pane is expanded, remembered under `storageKey`. */
function usePersistedFiltersVisibility(
	storageKey: string,
): [boolean, () => void] {
	const [isVisible, setIsVisible] = useState<boolean>(
		() => getLocalStorageKey(storageKey) !== 'false',
	);

	const toggle = useCallback((): void => {
		setIsVisible((visible) => {
			setLocalStorageKey(storageKey, String(!visible));
			return !visible;
		});
	}, [storageKey]);

	return [isVisible, toggle];
}

export default usePersistedFiltersVisibility;
