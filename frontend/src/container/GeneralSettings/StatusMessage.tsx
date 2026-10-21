import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from 'lib/utils';
import { Info } from 'lucide-react';
import { TStatus } from 'types/api/settings/getRetention';

import { convertHoursValueToRelevantUnitString } from './utils';

function StatusMessage({
	total_retention,
	s3_retention,
	status,
}: StatusMessageProps): JSX.Element | null {
	const { t } = useTranslation(['generalSettings']);

	const toneClassName = useMemo((): string => {
		if (status === 'success') {
			return 'tw:bg-success-soft tw:text-success-ink';
		}
		if (status === 'pending') {
			return 'tw:bg-warning-soft tw:text-warning-ink';
		}
		if (status === 'failed') {
			return 'tw:bg-error-soft tw:text-error-ink';
		}
		return 'tw:bg-surface-sunken tw:text-muted-foreground';
	}, [status]);
	if (!status) {
		return null;
	}
	const s3Part =
		s3_retention && s3_retention !== -1
			? t('status_message.s3_part', {
					s3_retention: convertHoursValueToRelevantUnitString(s3_retention),
				})
			: '';
	const statusMessage =
		total_retention && total_retention !== -1
			? t(`status_message.${status}`, {
					total_retention: convertHoursValueToRelevantUnitString(total_retention),
					s3_part: s3Part,
				})
			: null;

	return statusMessage ? (
		<div className="fs-ui tw:px-5 tw:pb-3 tw:font-sans">
			<div
				data-testid="retention-status-message"
				className={cn(
					'tw:flex tw:items-center tw:gap-2 tw:rounded-md tw:px-3 tw:py-2 tw:text-[13px]',
					toneClassName,
				)}
			>
				<Info className="tw:size-4 tw:flex-none" aria-hidden="true" />
				{statusMessage}
			</div>
		</div>
	) : null;
}

interface StatusMessageProps {
	status: TStatus;
	total_retention: number | undefined;
	s3_retention: number | undefined;
}
export default StatusMessage;
