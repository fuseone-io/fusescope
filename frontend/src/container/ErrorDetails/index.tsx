import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'react-query';
import { useLocation } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import getNextPrevId from 'api/errors/getNextPrevId';
import Editor from 'components/Editor';
import KpiStrip from 'components/PageTemplate/components/KpiStrip';
import PageHeader from 'components/PageTemplate/components/PageHeader';
import Panel from 'components/PageTemplate/components/Panel';
import Stat from 'components/PageTemplate/components/Stat';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import PageTemplate from 'components/PageTemplate/PageTemplate';
import { Button } from 'components/ui/button';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import { getNanoSeconds } from 'container/AllError/utils';
import { useNotifications } from 'hooks/useNotifications';
import createQueryParams from 'lib/createQueryParams';
import history from 'lib/history';
import { isUndefined } from 'lodash-es';
import {
	Bug,
	ChevronLeft,
	ChevronRight,
	LoaderCircle,
	Waypoints,
} from 'lucide-react';
import { urlKey } from 'pages/ErrorDetails/utils';
import { useTimezone } from 'providers/Timezone';
import { PayloadProps as GetByErrorTypeAndServicePayload } from 'types/api/errors/getByErrorTypeAndService';
import { isModifierKeyPressed } from 'utils/app';
import { openInNewTab } from 'utils/navigation';

import { keyToExclude } from './config';
import ErrorAttributesTable from './ErrorAttributesTable';

function ErrorDetails(props: ErrorDetailsProps): JSX.Element {
	const { idPayload } = props;
	const { t } = useTranslation(['errorDetails', 'common']);
	const { search, pathname } = useLocation();

	const params = useMemo(() => new URLSearchParams(search), [search]);

	const errorId = params.get(urlKey.errorId);
	const serviceName = params.get(urlKey.serviceName);
	const errorType = params.get(urlKey.exceptionType);
	const timestamp = params.get(urlKey.timestamp);

	const { data: nextPrevData, status: nextPrevStatus } = useQuery(
		[
			idPayload.errorId,
			idPayload.groupID,
			idPayload.timestamp,
			errorId,
			serviceName,
			errorType,
			timestamp,
		],
		{
			queryFn: () =>
				getNextPrevId({
					errorID: errorId || idPayload.errorId,
					groupID: idPayload.groupID,
					timestamp: timestamp || getNanoSeconds(idPayload.timestamp),
				}),
		},
	);

	const errorDetail = idPayload;

	const [stackTraceValue] = useState(errorDetail.exceptionStacktrace);

	const { notifications } = useNotifications();

	const onClickErrorIdHandler = async (
		id: string,
		timestamp: string,
	): Promise<void> => {
		try {
			if (id.length === 0) {
				notifications.error({
					message: 'Error Id cannot be empty',
				});
				return;
			}

			const queryParams = {
				groupId: idPayload.groupID,
				timestamp: getNanoSeconds(timestamp),
				errorId: id,
			};

			history.replace(`${pathname}?${createQueryParams(queryParams)}`);
		} catch (error) {
			notifications.error({
				message: t('something_went_wrong'),
			});
		}
	};

	const data: { key: string; value: string }[] = Object.keys(errorDetail)
		.filter((e) => !keyToExclude.includes(e))
		.map((key) => ({
			key,
			value: errorDetail[key as keyof GetByErrorTypeAndServicePayload],
		}));

	const onClickTraceHandler = (event: React.MouseEvent): void => {
		logEvent('Exception: Navigate to trace detail page', {
			groupId: errorDetail?.groupID,
			spanId: errorDetail.spanID,
			traceId: errorDetail.traceID,
			exceptionId: errorDetail?.errorId,
		});
		const path = `/trace/${errorDetail.traceID}?spanId=${errorDetail.spanID}`;
		if (isModifierKeyPressed(event)) {
			openInNewTab(path);
		} else {
			history.push(path);
		}
	};

	const logEventCalledRef = useRef(false);
	useEffect(() => {
		if (!logEventCalledRef.current && !isUndefined(data)) {
			logEvent('Exception: Detail page visited', {
				groupId: errorDetail?.groupID,
				spanId: errorDetail.spanID,
				traceId: errorDetail.traceID,
				exceptionId: errorDetail?.errorId,
			});
			logEventCalledRef.current = true;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data]);

	const { formatTimezoneAdjustedTimestamp } = useTimezone();

	const isNavigating = nextPrevStatus === 'loading';

	return (
		<PageTemplate testId="error-details-page">
			<PageHeader
				icon={<Bug />}
				titleMono
				title={errorDetail.exceptionType}
				badges={
					errorDetail.serviceName && (
						<StatusBadge tone="neutral" className="tw:font-mono">
							{errorDetail.serviceName}
						</StatusBadge>
					)
				}
				description={
					<span className="tw:font-mono tw:text-xs tw:break-all">
						{errorDetail.exceptionMessage}
					</span>
				}
				actions={
					<>
						<Button
							variant="outline"
							size="sm"
							data-testid="error-details-older"
							disabled={
								isNavigating || nextPrevData?.payload?.prevErrorID.length === 0
							}
							onClick={(): Promise<void> =>
								onClickErrorIdHandler(
									nextPrevData?.payload?.prevErrorID || '',
									nextPrevData?.payload?.prevTimestamp || '',
								)
							}
						>
							{isNavigating ? (
								<LoaderCircle className="tw:animate-spin" />
							) : (
								<ChevronLeft />
							)}
							{t('older')}
						</Button>
						<Button
							variant="outline"
							size="sm"
							data-testid="error-details-newer"
							disabled={
								isNavigating || nextPrevData?.payload?.nextErrorID.length === 0
							}
							onClick={(): Promise<void> =>
								onClickErrorIdHandler(
									nextPrevData?.payload?.nextErrorID || '',
									nextPrevData?.payload?.nextTimestamp || '',
								)
							}
						>
							{t('newer')}
							{isNavigating ? (
								<LoaderCircle className="tw:animate-spin" />
							) : (
								<ChevronRight />
							)}
						</Button>
						<Button
							size="sm"
							title={t('see_trace_graph')}
							data-testid="error-details-trace"
							onClick={onClickTraceHandler}
						>
							<Waypoints />
							{t('see_error_in_trace_graph')}
						</Button>
					</>
				}
			/>

			<KpiStrip label="Event">
				<Stat
					label="Event"
					value={
						<span className="tw:font-mono tw:text-sm tw:font-medium tw:tracking-normal tw:break-all">
							{errorDetail.errorId}
						</span>
					}
				/>
				<Stat
					label="Timestamp"
					value={
						<span className="tw:text-sm tw:font-medium tw:tracking-normal">
							{formatTimezoneAdjustedTimestamp(
								errorDetail.timestamp,
								DATE_TIME_FORMATS.UTC_FULL,
							)}
						</span>
					}
				/>
				<Stat
					label="Trace ID"
					value={
						<span className="tw:font-mono tw:text-sm tw:font-medium tw:tracking-normal tw:break-all">
							{errorDetail.traceID}
						</span>
					}
				/>
			</KpiStrip>

			<Panel title={t('stack_trace')} bodyClassName="tw:mt-3 tw:px-1 tw:pb-1">
				<div className="tw:h-[50vh]">
					<Editor value={stackTraceValue} readOnly />
				</div>
			</Panel>

			<Panel
				title="Attributes"
				className="tw:overflow-hidden"
				bodyClassName="tw:mt-3 tw:border-t tw:border-border"
			>
				<ErrorAttributesTable rows={data} />
			</Panel>
		</PageTemplate>
	);
}

interface ErrorDetailsProps {
	idPayload: GetByErrorTypeAndServicePayload;
}

export default ErrorDetails;
