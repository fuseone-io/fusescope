/** Share of sessions with at least one error, in percent. */
export function sessionErrorRate(
	sessionsWithErrors: number,
	sessions: number,
): number | undefined {
	if (!(sessions > 0)) {
		return undefined;
	}
	return (Math.min(sessionsWithErrors, sessions) / sessions) * 100;
}

/** Change in percentage points. */
export function errorRateDelta(
	current: number | undefined,
	previous: number | undefined,
): number | undefined {
	if (current === undefined || previous === undefined) {
		return undefined;
	}
	return current - previous;
}
