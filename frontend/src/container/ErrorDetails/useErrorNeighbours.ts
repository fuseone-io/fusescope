import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'react-query';
import { useLocation } from 'react-router-dom';
import getNextPrevId from 'api/errors/getNextPrevId';
import { getNanoSeconds } from 'container/AllError/utils';
import { useNotifications } from 'hooks/useNotifications';
import createQueryParams from 'lib/createQueryParams';
import history from 'lib/history';
import { urlKey } from 'pages/ErrorDetails/utils';
import { PayloadProps as ErrorEvent } from 'types/api/errors/getByErrorTypeAndService';

interface Neighbour {
	id: string;
	timestamp: string;
}

interface ErrorNeighbours {
	older: Neighbour | null;
	newer: Neighbour | null;
	isLoading: boolean;
	/** Replaces the url with another event of the same group. */
	goTo: (neighbour: Neighbour | null) => void;
}

const neighbour = (id = '', timestamp = ''): Neighbour | null =>
	id ? { id, timestamp } : null;

/** The events of the group just before and after the one on screen. */
export function useErrorNeighbours(event: ErrorEvent): ErrorNeighbours {
	const { t } = useTranslation(['common']);
	const { search, pathname } = useLocation();
	const { notifications } = useNotifications();
	const params = useMemo(() => new URLSearchParams(search), [search]);

	const errorId = params.get(urlKey.errorId);
	const serviceName = params.get(urlKey.serviceName);
	const errorType = params.get(urlKey.exceptionType);
	const timestamp = params.get(urlKey.timestamp);

	const { data, status } = useQuery(
		[
			event.errorId,
			event.groupID,
			event.timestamp,
			errorId,
			serviceName,
			errorType,
			timestamp,
		],
		{
			queryFn: () =>
				getNextPrevId({
					errorID: errorId || event.errorId,
					groupID: event.groupID,
					timestamp: timestamp || getNanoSeconds(event.timestamp),
				}),
		},
	);

	const goTo = (target: Neighbour | null): void => {
		if (!target) {
			notifications.error({ message: 'Error Id cannot be empty' });
			return;
		}
		try {
			history.replace(
				`${pathname}?${createQueryParams({
					groupId: event.groupID,
					timestamp: getNanoSeconds(target.timestamp),
					errorId: target.id,
				})}`,
			);
		} catch {
			notifications.error({ message: t('something_went_wrong') });
		}
	};

	return {
		older: neighbour(data?.payload?.prevErrorID, data?.payload?.prevTimestamp),
		newer: neighbour(data?.payload?.nextErrorID, data?.payload?.nextTimestamp),
		isLoading: status === 'loading',
		goTo,
	};
}
