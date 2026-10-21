import { useEffect, useRef } from 'react';
import logEvent from 'api/common/logEvent';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import HeaderBandLayout from 'components/PageTemplate/components/HeaderBandLayout';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import history from 'lib/history';
import { useTimezone } from 'providers/Timezone';
import { PayloadProps as GetByErrorTypeAndServicePayload } from 'types/api/errors/getByErrorTypeAndService';
import { isModifierKeyPressed } from 'utils/app';
import { openInNewTab } from 'utils/navigation';

import { keyToExclude } from './config';
import ErrorAttributesTable from './ErrorAttributesTable';
import ErrorDetailsHeader from './ErrorDetailsHeader';
import ErrorEventActions from './ErrorEventActions';
import ErrorEventStats from './ErrorEventStats';
import StackTrace from './StackTrace';
import { useErrorGroupSummary } from './useErrorGroupSummary';
import { useErrorNeighbours } from './useErrorNeighbours';
import { traceLogsUrl, traceUrl } from './utils';

function navigate(path: string, event: React.MouseEvent): void {
	if (isModifierKeyPressed(event)) {
		openInNewTab(path);
	} else {
		history.push(path);
	}
}

function ErrorDetails(props: ErrorDetailsProps): JSX.Element {
	const { idPayload: errorDetail } = props;
	const neighbours = useErrorNeighbours(errorDetail);
	const { group, isLoading: isGroupLoading } = useErrorGroupSummary(errorDetail);
	const { formatTimezoneAdjustedTimestamp } = useTimezone();

	const data: { key: string; value: string }[] = Object.keys(errorDetail)
		.filter((e) => !keyToExclude.includes(e))
		.map((key) => ({
			key,
			value: errorDetail[key as keyof GetByErrorTypeAndServicePayload],
		}));

	const onClickTraceHandler = (event: React.MouseEvent): void => {
		void logEvent('Exception: Navigate to trace detail page', {
			groupId: errorDetail?.groupID,
			spanId: errorDetail.spanID,
			traceId: errorDetail.traceID,
			exceptionId: errorDetail?.errorId,
		});
		navigate(traceUrl(errorDetail.traceID, errorDetail.spanID), event);
	};

	const onClickLogsHandler = (event: React.MouseEvent): void => {
		navigate(traceLogsUrl(errorDetail.traceID, errorDetail.timestamp), event);
	};

	const logEventCalledRef = useRef(false);
	useEffect(() => {
		if (!logEventCalledRef.current) {
			void logEvent('Exception: Detail page visited', {
				groupId: errorDetail?.groupID,
				spanId: errorDetail.spanID,
				traceId: errorDetail.traceID,
				exceptionId: errorDetail?.errorId,
			});
			logEventCalledRef.current = true;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<HeaderBandLayout
			testId="error-details-page"
			header={<ErrorDetailsHeader event={errorDetail} />}
		>
			<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-4 tw:px-4 tw:pt-4 tw:pb-8 tw:md:px-6">
				<ContentPanel
					testId="error-details-event"
					title="Event"
					subtitle={
						<span className="tw:font-mono" title={errorDetail.errorId}>
							{errorDetail.errorId} ·{' '}
							{formatTimezoneAdjustedTimestamp(
								errorDetail.timestamp,
								DATE_TIME_FORMATS.UTC_FULL,
							)}
						</span>
					}
					actions={
						<ErrorEventActions
							neighbours={neighbours}
							onViewTrace={onClickTraceHandler}
							onViewLogs={onClickLogsHandler}
						/>
					}
					divided
				>
					<ErrorEventStats
						event={errorDetail}
						group={group}
						isGroupLoading={isGroupLoading}
					/>
					<StackTrace text={errorDetail.exceptionStacktrace} />
				</ContentPanel>

				<ContentPanel testId="error-details-attributes" title="Attributes" divided>
					<ErrorAttributesTable rows={data} />
				</ContentPanel>
			</div>
		</HeaderBandLayout>
	);
}

interface ErrorDetailsProps {
	idPayload: GetByErrorTypeAndServicePayload;
}

export default ErrorDetails;
