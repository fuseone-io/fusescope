import dayjs from 'dayjs';
import { isNull, isUndefined } from 'lodash-es';
import { IntegrationConnectionStatus } from 'types/api/integrations/types';

import { ConnectionStates } from './TestConnection';

export function getConnectionStatesFromConnectionStatus(
	installation:
		| {
				installed_at: string;
		  }
		| null
		| undefined,
	connection_status: {
		logs:
			| {
					last_received_ts_ms: number;
					last_received_from: string;
			  }
			| null
			| undefined;
		metrics:
			| {
					last_received_ts_ms: number;
					last_received_from: string;
			  }
			| null
			| undefined;
	},
): ConnectionStates {
	if (isNull(installation) || isUndefined(installation)) {
		return ConnectionStates.NotInstalled;
	}
	if (
		(isNull(connection_status.logs) || isUndefined(connection_status.logs)) &&
		(isNull(connection_status.metrics) || isUndefined(connection_status.metrics))
	) {
		const installationDate = dayjs(installation.installed_at);
		if (installationDate.isBefore(dayjs().subtract(7, 'days'))) {
			return ConnectionStates.NoDataSinceLong;
		}
		return ConnectionStates.TestingConnection;
	}

	const logsDate = dayjs(connection_status.logs?.last_received_ts_ms);
	const metricsDate = dayjs(connection_status.metrics?.last_received_ts_ms);

	if (
		logsDate.isBefore(dayjs().subtract(7, 'days')) &&
		metricsDate.isBefore(dayjs().subtract(7, 'days'))
	) {
		return ConnectionStates.NoDataSinceLong;
	}

	return ConnectionStates.Connected;
}

interface LatestReceivedData {
	last_received_ts_ms: number | null;
	last_received_from: string | null;
}

export function getLatestReceivedData(
	connectionData: IntegrationConnectionStatus,
): LatestReceivedData {
	const { logs, metrics } = connectionData;

	if (logs?.last_received_ts_ms && metrics?.last_received_ts_ms) {
		const latest =
			logs.last_received_ts_ms > metrics.last_received_ts_ms ? logs : metrics;
		return {
			last_received_ts_ms: latest.last_received_ts_ms,
			last_received_from: latest.last_received_from,
		};
	}
	if (logs?.last_received_ts_ms) {
		return {
			last_received_ts_ms: logs.last_received_ts_ms,
			last_received_from: logs.last_received_from,
		};
	}
	if (metrics?.last_received_ts_ms) {
		return {
			last_received_ts_ms: metrics.last_received_ts_ms,
			last_received_from: metrics.last_received_from,
		};
	}
	return { last_received_ts_ms: null, last_received_from: null };
}
