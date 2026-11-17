// ─── Constants ───────────────────────────────────────────────────────────

export const ALERTS_LIST_PATH = '/alerts';
export const ALERT_OVERVIEW_PATH = '/alerts/overview';
export const ALERT_HISTORY_PATH = '/alerts/history';

/**
 * Mirrors `TIMELINE_TABLE_PAGE_SIZE` in
 * `frontend/src/container/AlertHistory/constants.ts`. This 20 is what makes the
 * page-2 cursor `base64url({"offset":20,"limit":20})`, so the two must not drift.
 */
export const TIMELINE_PAGE_SIZE = 20;

/** The `relativeTime` the history page falls back to (`DEFAULT_TIME_RANGE`). */
export const DEFAULT_RELATIVE_TIME = '30m';

/**
 * Page size the list specs pin in the URL, so the number of rendered rows never
 * depends on the viewport height.
 */
export const ALERT_LIST_PAGE_SIZE = 10;

/** Severities the list seed cycles through, so search/sort tests have more than one value. */
export const SEED_B_SEVERITIES = ['critical', 'warning', 'info'] as const;

// ─── Wait timeouts (ms) ──────────────────────────────────────────────────
// These timeouts gate on the "ruler" — SigNoz's alert evaluation engine that
// runs on ~15s cycles and writes history rows to ClickHouse. No way to force
// evaluation or seed history directly, so we poll until rows appear.

/**
 * Default timeout for waitForTimelineEntries.
 *
 * Logs rules need 2+ ruler cycles (~15s each) to see 25 services fire.
 * 90s = 6 cycles worst-case. Actual time: 20-35s for logs, ~10s for metrics.
 */
export const WAIT_TIMELINE_ENTRIES_DEFAULT = 90_000;

/**
 * Default timeout for waitForTimelineStates (firing + resolved).
 *
 * Resolved state appears after evalWindow expires with no matching data.
 * 1m window + 2 ruler cycles = ~105s observed. 180s = safe margin.
 */
export const WAIT_TIMELINE_STATES_DEFAULT = 180_000;

// ─── Anomaly seed ────────────────────────────────────────────────────────
// Four seasons at these offsets from the baseline predict the baseline with a
// scale of 1.4826 (the MAD of ±0.5 and ±1.5, scaled), so a z-score of 3 puts
// the band at baseline ± 4.4478.

export const ANOMALY_BASELINE = 100;
export const ANOMALY_SEASON_OFFSETS = [-1.5, -0.5, 0.5, 1.5];
export const ANOMALY_SCALE = 1.4826;
export const ANOMALY_SPIKE = 400;
/** Current-window points carrying the spike, at its end. */
export const ANOMALY_SPIKE_POINTS = 10;
/** Seeded minutes before each season's end: wider than any preview window used. */
export const ANOMALY_SPAN_MINUTES = 90;
export const DAY_MS = 24 * 60 * 60 * 1000;
