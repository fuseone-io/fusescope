import { StatusTone } from 'components/PageTemplate/types';
import { SdkSupport, VitalRating } from 'lib/rum/types';

export const RATING_LABELS: Record<VitalRating, string> = {
	good: 'Good',
	'needs-improvement': 'Needs work',
	poor: 'Poor',
};

export const RATING_TONES: Record<VitalRating, StatusTone> = {
	good: 'success',
	'needs-improvement': 'warning',
	poor: 'error',
};

export const SDK_SUPPORT_LABELS: Record<SdkSupport, string> = {
	supported: 'Supported',
	outdated: 'Outdated',
	other: 'Other client',
	unknown: 'Unknown',
};

export const SDK_SUPPORT_TONES: Record<SdkSupport, StatusTone> = {
	supported: 'success',
	outdated: 'warning',
	other: 'neutral',
	unknown: 'neutral',
};

export const SDK_SUPPORT_TITLES: Record<SdkSupport, string> = {
	supported: 'Tested with this FuseScope version',
	outdated:
		'Older than the versions this server supports. Data is still accepted.',
	other:
		'Not the FuseScope SDK, or a version this server does not know. Data is accepted.',
	unknown: 'No SDK reported yet',
};
