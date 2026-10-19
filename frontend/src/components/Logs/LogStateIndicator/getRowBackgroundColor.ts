import { severityTint } from './severityTint';

export function getRowBackgroundColor(
	// The tint follows the theme through the FuseScope tokens.
	_isDarkMode: boolean,
	logType?: string,
): string {
	return severityTint(logType);
}
