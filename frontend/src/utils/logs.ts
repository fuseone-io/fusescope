import { orange } from '@ant-design/colors';
import { severityTint } from 'components/Logs/LogStateIndicator/severityTint';

export const getDefaultLogBackground = (
	isReadOnly?: boolean,
	isDarkMode?: boolean,
): string => {
	if (isReadOnly) {
		return '';
	}
	return `&:hover {
    background-color: ${
					isDarkMode ? 'rgba(171, 189, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)'
				};
    }`;
};

export const getActiveLogBackground = (
	isActiveLog = true,
	// The tint follows the theme through the FuseScope tokens.
	_isDarkMode = true,
	logType?: string,
): string => {
	if (!isActiveLog) {
		return ``;
	}
	return `background-color: ${severityTint(logType)} !important;`;
};

export const getHightLightedLogBackground = (
	isHighlightedLog = true,
): string => {
	if (!isHighlightedLog) {
		return '';
	}
	return `background-color: ${orange[3]};`;
};

export const getCustomHighlightBackground = (isHighlighted = false): string => {
	if (!isHighlighted) {
		return '';
	}

	return `background-color: ${severityTint()};`;
};
