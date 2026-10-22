import { RumtypesPlatformDTO } from 'api/generated/services/fuseScope.schemas';

export const PLATFORM_LABELS: Record<RumtypesPlatformDTO, string> = {
	[RumtypesPlatformDTO.web]: 'Web',
	[RumtypesPlatformDTO.android]: 'Android',
	[RumtypesPlatformDTO.ios]: 'iOS',
};
