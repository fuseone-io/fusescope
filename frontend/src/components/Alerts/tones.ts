import { StatusTone } from 'components/PageTemplate/types';

export const STATE_TONES: Record<string, StatusTone> = {
	firing: 'error',
	pending: 'warning',
	inactive: 'success',
	disabled: 'neutral',
};

export const SEVERITY_TONES: Record<string, StatusTone> = {
	critical: 'error',
	error: 'error',
	warning: 'warning',
	info: 'info',
};
