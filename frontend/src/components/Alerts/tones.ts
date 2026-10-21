import { StatusTone } from 'components/PageTemplate/types';

export const STATE_TONES: Record<string, StatusTone> = {
	firing: 'error',
	pending: 'warning',
	recovering: 'warning',
	inactive: 'success',
	disabled: 'neutral',
};

/** States drawn outside the status tones: No data takes the brand accent. */
export const STATE_BADGE_CLASSES: Record<string, string> = {
	nodata: 'tw:bg-brand-secondary-soft tw:text-brand-secondary-ink',
};

export const SEVERITY_TONES: Record<string, StatusTone> = {
	critical: 'error',
	error: 'warning',
	warning: 'warning',
	info: 'info',
};
