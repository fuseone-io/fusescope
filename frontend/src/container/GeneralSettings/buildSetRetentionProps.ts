import { TTTLType } from 'types/api/settings/common';
import { Props } from 'types/api/settings/setRetention';

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
