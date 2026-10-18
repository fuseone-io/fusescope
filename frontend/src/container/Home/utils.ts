import { StatusTone } from 'components/PageTemplate/types';

const SEVERITY_TONES: Record<string, StatusTone> = {
	critical: 'error',
	error: 'warning',
	warning: 'warning',
	info: 'info',
};

export function severityTone(severity: string | undefined): StatusTone {
	return SEVERITY_TONES[(severity ?? '').toLowerCase()] ?? 'neutral';
}
