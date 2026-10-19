import { LogType } from './LogStateIndicator';

const SEVERITY_TOKEN: Record<string, string> = {
	[LogType.TRACE]: 'var(--fs-subtle-foreground)',
	[LogType.DEBUG]: 'var(--fs-muted-foreground)',
	[LogType.INFO]: 'var(--fs-primary)',
	[LogType.WARN]: 'var(--fs-warning)',
	[LogType.ERROR]: 'var(--fs-error)',
	[LogType.FATAL]: 'var(--fs-brand-secondary)',
	[LogType.UNKNOWN]: 'var(--fs-input)',
};

/** The FuseScope colour of a log type, as a CSS value that follows the theme. */
export function severityColor(logType?: string): string {
	return SEVERITY_TOKEN[logType ?? ''] ?? SEVERITY_TOKEN[LogType.INFO];
}

/** A translucent wash of the log type's colour, for selected rows. */
export function severityTint(logType?: string, percent = 14): string {
	return `color-mix(in srgb, ${severityColor(logType)} ${percent}%, transparent)`;
}
