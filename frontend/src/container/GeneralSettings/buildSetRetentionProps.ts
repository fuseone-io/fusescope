import { TTTLType } from 'types/api/settings/common';
import { Props, PropsV2 } from 'types/api/settings/setRetention';

interface BuildSetRetentionPropsArgs {
	type: Exclude<TTTLType, 'logs'>;
	totalRetentionHours: number | null | undefined;
	s3RetentionHours: number | null | undefined;
	s3Enabled: boolean;
}

export const buildSetRetentionProps = ({
	type,
	totalRetentionHours,
	s3RetentionHours,
	s3Enabled,
}: BuildSetRetentionPropsArgs): Props => {
	const totalDuration = `${totalRetentionHours || -1}h`;
	if (!s3Enabled || !s3RetentionHours || s3RetentionHours <= 0) {
		return { type, totalDuration };
	}
	return {
		type,
		totalDuration,
		coldStorage: 's3',
		toColdDuration: `${s3RetentionHours}h`,
	};
};

export const buildSetLogsRetentionProps = ({
	totalRetentionHours,
	s3RetentionHours,
	s3Enabled,
}: Omit<BuildSetRetentionPropsArgs, 'type'>): PropsV2 => {
	const coldDays =
		s3Enabled && s3RetentionHours && s3RetentionHours > 0
			? s3RetentionHours / 24
			: 0;
	return {
		type: 'logs',
		defaultTTLDays: totalRetentionHours ? totalRetentionHours / 24 : -1,
		coldStorageVolume: coldDays > 0 ? 's3' : '',
		coldStorageDurationDays: coldDays,
		ttlConditions: [],
	};
};
