import axios from 'axios';
import { SOMETHING_WENT_WRONG } from 'constants/api';

import { OnSaveApDexSettingsProps } from './types';

export const onSaveApDexSettings =
	({
		thresholdValue,
		refetchGetApDexSetting,
		mutateAsync,
		notifications,
		handlePopOverClose,
		servicename,
	}: OnSaveApDexSettingsProps) =>
	async (): Promise<void> => {
		if (!refetchGetApDexSetting) {
			return;
		}

		try {
			await mutateAsync({
				servicename,
				threshold: thresholdValue,
				excludeStatusCode: '',
			});
			await refetchGetApDexSetting();
		} catch (err) {
			notifications.error({
				message: axios.isAxiosError(err) ? err.message : SOMETHING_WENT_WRONG,
			});
		} finally {
			handlePopOverClose();
		}
	};
