import { ILog } from 'types/api/logs/log';
import { normalizeSeverity } from 'utils/logSeverity';

import { LogType } from './LogStateIndicator';

const getLogType = (
	severityText: string,
	severityNumber: number,
	defaultType: string,
): string => {
	const level = normalizeSeverity(severityNumber, severityText);
	return level === 'UNKNOWN' ? defaultType : level;
};

export const getLogIndicatorType = (logData: ILog): string => {
	const defaultType = logData.attributes_string?.log_level || LogType.INFO;
	// convert the severity_text to upper case for the comparison to support case insensitive values
	return getLogType(
		logData?.severity_text?.toUpperCase(),
		logData?.severity_number || 0,
		defaultType,
	);
};

export const getLogIndicatorTypeForTable = (
	log: Record<string, unknown>,
): string => {
	const defaultType = (log.log_level as string) || LogType.INFO;
	// convert the severity_text to upper case for the comparison to support case insensitive values
	return getLogType(
		(log?.severity_text as string)?.toUpperCase(),
		(log?.severity_number as number) || 0,
		defaultType,
	);
};
