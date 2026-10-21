import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UseQueryResult } from 'react-query';
import { useInterval } from 'react-use';
import { BarChart3, Compass, ScrollText } from 'lucide-react';
import setRetentionApi from 'api/settings/setRetention';
import setRetentionApiV2 from 'api/settings/setRetentionV2';
import TextToolTip from 'components/TextToolTip';
import { fuseScopeDocsUrl } from 'constants/docs';
import CustomDomainSettings from 'container/CustomDomainSettings';
import { buildSetRetentionProps } from 'container/GeneralSettings/buildSetRetentionProps';
import LicenseKeyRow from 'container/GeneralSettings/LicenseKeyRow/LicenseKeyRow';
import GeneralSettingsCloud from 'container/GeneralSettingsCloud';
import useComponentPermission from 'hooks/useComponentPermission';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { useNotifications } from 'hooks/useNotifications';
import { StatusCodes } from 'http-status-codes';
import find from 'lodash-es/find';
import { AuthZGuardContent } from 'lib/authz/components/AuthZGuard/AuthZGuardContent';
import { buildLicenseReadPermission } from 'lib/authz/hooks/useAuthZ/permissions/license.permissions';
import { useAppContext } from 'providers/App/App';
import {
	ErrorResponse,
	ErrorResponseV2,
	SuccessResponse,
	SuccessResponseV2,
} from 'types/api';
import {
	IDiskType,
	PayloadProps as GetDisksPayload,
} from 'types/api/disks/getDisks';
import APIError from 'types/api/error';
import { TTTLType } from 'types/api/settings/common';
import {
	PayloadPropsLogs as GetRetentionPeriodLogsPayload,
	PayloadPropsMetrics as GetRetentionPeriodMetricsPayload,
	PayloadPropsTraces as GetRetentionPeriodTracesPayload,
} from 'types/api/settings/getRetention';
import { USER_ROLES } from 'types/roles';

import LicenseRowDismissibleCallout from './LicenseKeyRow/LicenseRowDismissibleCallout/LicenseRowDismissibleCallout';
import Retention from './Retention';
import StatusMessage from './StatusMessage';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import SettingsPageShell from 'pages/Settings/components/SettingsPageShell';
import RetentionConfirmDialog from './RetentionConfirmDialog';
import RetentionSaveButton from './RetentionSaveButton';

type NumberOrNull = number | null;

// eslint-disable-next-line sonarjs/cognitive-complexity
function GeneralSettings({
	metricsTtlValuesPayload,
	tracesTtlValuesPayload,
	logsTtlValuesPayload,
	getAvailableDiskPayload,
	metricsTtlValuesRefetch,
	tracesTtlValuesRefetch,
	logsTtlValuesRefetch,
}: GeneralSettingsProps): JSX.Element {
	const { t } = useTranslation(['generalSettings']);
	const [modalMetrics, setModalMetrics] = useState<boolean>(false);
	const [modalTraces, setModalTraces] = useState<boolean>(false);
	const [modalLogs, setModalLogs] = useState<boolean>(false);

	const [postApiLoadingMetrics, setPostApiLoadingMetrics] =
		useState<boolean>(false);
	const [postApiLoadingTraces, setPostApiLoadingTraces] =
		useState<boolean>(false);
	const [postApiLoadingLogs, setPostApiLoadingLogs] = useState<boolean>(false);

	const [availableDisks] = useState<IDiskType[]>(getAvailableDiskPayload);

	const [metricsCurrentTTLValues, setMetricsCurrentTTLValues] = useState(
		metricsTtlValuesPayload,
	);
	const [tracesCurrentTTLValues, setTracesCurrentTTLValues] = useState(
		tracesTtlValuesPayload,
	);

	const [logsCurrentTTLValues, setLogsCurrentTTLValues] =
		useState(logsTtlValuesPayload);

	const { user, activeLicense } = useAppContext();

	const [setRetentionPermission] = useComponentPermission(
		['set_retention_period'],
		user.role,
	);

	const [metricsTotalRetentionPeriod, setMetricsTotalRetentionPeriod] =
		useState<NumberOrNull>(null);
	const [metricsS3RetentionPeriod, setMetricsS3RetentionPeriod] =
		useState<NumberOrNull>(null);
	const [tracesTotalRetentionPeriod, setTracesTotalRetentionPeriod] =
		useState<NumberOrNull>(null);
	const [tracesS3RetentionPeriod, setTracesS3RetentionPeriod] =
		useState<NumberOrNull>(null);

	const [logsTotalRetentionPeriod, setLogsTotalRetentionPeriod] =
		useState<NumberOrNull>(null);
	const [logsS3RetentionPeriod, setLogsS3RetentionPeriod] =
		useState<NumberOrNull>(null);

	useEffect(() => {
		if (metricsCurrentTTLValues) {
			setMetricsTotalRetentionPeriod(
				metricsCurrentTTLValues.metrics_ttl_duration_hrs,
			);
			setMetricsS3RetentionPeriod(
				metricsCurrentTTLValues.metrics_move_ttl_duration_hrs
					? metricsCurrentTTLValues.metrics_move_ttl_duration_hrs
					: null,
			);
		}
	}, [metricsCurrentTTLValues]);

	useEffect(() => {
		if (tracesCurrentTTLValues) {
			setTracesTotalRetentionPeriod(
				tracesCurrentTTLValues.traces_ttl_duration_hrs,
			);
			setTracesS3RetentionPeriod(
				tracesCurrentTTLValues.traces_move_ttl_duration_hrs
					? tracesCurrentTTLValues.traces_move_ttl_duration_hrs
					: null,
			);
		}
	}, [tracesCurrentTTLValues]);

	useEffect(() => {
		if (logsCurrentTTLValues) {
			setLogsTotalRetentionPeriod(logsCurrentTTLValues.default_ttl_days * 24);
			setLogsS3RetentionPeriod(
				logsCurrentTTLValues.cold_storage_ttl_days
					? logsCurrentTTLValues.cold_storage_ttl_days * 24
					: null,
			);
		}
	}, [logsCurrentTTLValues]);

	useInterval(
		async (): Promise<void> => {
			if (metricsTtlValuesPayload.status === 'pending') {
				metricsTtlValuesRefetch();
			}
		},
		metricsTtlValuesPayload.status === 'pending' ? 1000 : null,
	);

	useInterval(
		async (): Promise<void> => {
			if (tracesTtlValuesPayload.status === 'pending') {
				tracesTtlValuesRefetch();
			}
		},
		tracesTtlValuesPayload.status === 'pending' ? 1000 : null,
	);

	useInterval(
		async (): Promise<void> => {
			if (logsTtlValuesPayload.status === 'pending') {
				logsTtlValuesRefetch();
			}
		},
		logsTtlValuesPayload.status === 'pending' ? 1000 : null,
	);

	const { notifications } = useNotifications();

	const onModalToggleHandler = (type: TTTLType): void => {
		if (type === 'metrics') {
			setModalMetrics((modal) => !modal);
		}
		if (type === 'traces') {
			setModalTraces((modal) => !modal);
		}
		if (type === 'logs') {
			setModalLogs((modal) => !modal);
		}
	};
	const onPostApiLoadingHandler = (type: TTTLType): void => {
		if (type === 'metrics') {
			setPostApiLoadingMetrics((modal) => !modal);
		}
		if (type === 'traces') {
			setPostApiLoadingTraces((modal) => !modal);
		}
		if (type === 'logs') {
			setPostApiLoadingLogs((modal) => !modal);
		}
	};

	const onClickSaveHandler = useCallback(
		(type: TTTLType) => {
			if (!setRetentionPermission) {
				notifications.error({
					message: `Sorry you don't have permission to make these changes`,
				});
				return;
			}
			onModalToggleHandler(type);
		},
		[setRetentionPermission, notifications],
	);

	const s3Enabled = useMemo(
		() =>
			!!find(
				availableDisks,
				(disks: IDiskType) =>
					disks?.type === 's3' || disks?.type === 'ObjectStorage',
			),
		[availableDisks],
	);

	const [
		isMetricsSaveDisabled,
		isTracesSaveDisabled,
		isLogsSaveDisabled,
		errorText,
	] = useMemo((): [
		boolean,
		boolean,
		boolean,
		string,
		// eslint-disable-next-line sonarjs/cognitive-complexity
	] => {
		// Various methods to return dynamic error message text.
		const messages = {
			compareError: (name: string | number): string =>
				t('retention_comparison_error', { name }),
			nullValueError: (name: string | number): string =>
				t('retention_null_value_error', { name }),
		};

		// Defaults to button not disabled and empty error message text.
		let isMetricsSaveDisabled = false;
		let isTracesSaveDisabled = false;
		let isLogsSaveDisabled = false;
		let errorText = '';

		if (s3Enabled) {
			if (
				(metricsTotalRetentionPeriod || metricsS3RetentionPeriod) &&
				Number(metricsTotalRetentionPeriod) <= Number(metricsS3RetentionPeriod)
			) {
				isMetricsSaveDisabled = true;
				errorText = messages.compareError('metrics');
			} else if (
				(tracesTotalRetentionPeriod || tracesS3RetentionPeriod) &&
				Number(tracesTotalRetentionPeriod) <= Number(tracesS3RetentionPeriod)
			) {
				isTracesSaveDisabled = true;
				errorText = messages.compareError('traces');
			} else if (
				(logsTotalRetentionPeriod || logsS3RetentionPeriod) &&
				Number(logsTotalRetentionPeriod) <= Number(logsS3RetentionPeriod)
			) {
				isLogsSaveDisabled = true;
				errorText = messages.compareError('logs');
			}
		}

		if (
			!metricsTotalRetentionPeriod ||
			!tracesTotalRetentionPeriod ||
			!logsTotalRetentionPeriod
		) {
			isMetricsSaveDisabled = true;
			isTracesSaveDisabled = true;
			isLogsSaveDisabled = true;
			if (
				!metricsTotalRetentionPeriod &&
				!tracesTotalRetentionPeriod &&
				!logsTotalRetentionPeriod
			) {
				errorText = messages.nullValueError('metrics, traces and logs');
			} else if (!metricsTotalRetentionPeriod) {
				errorText = messages.nullValueError('metrics');
			} else if (!tracesTotalRetentionPeriod) {
				errorText = messages.nullValueError('traces');
			} else if (!logsTotalRetentionPeriod) {
				errorText = messages.nullValueError('logs');
			}
		}
		if (
			metricsCurrentTTLValues?.metrics_ttl_duration_hrs ===
				metricsTotalRetentionPeriod &&
			metricsCurrentTTLValues.metrics_move_ttl_duration_hrs ===
				metricsS3RetentionPeriod
		) {
			isMetricsSaveDisabled = true;
		}

		if (
			tracesCurrentTTLValues.traces_ttl_duration_hrs ===
				tracesTotalRetentionPeriod &&
			tracesCurrentTTLValues.traces_move_ttl_duration_hrs ===
				tracesS3RetentionPeriod
		) {
			isTracesSaveDisabled = true;
		}

		if (
			logsCurrentTTLValues.default_ttl_days * 24 === logsTotalRetentionPeriod &&
			logsCurrentTTLValues.cold_storage_ttl_days &&
			logsCurrentTTLValues.cold_storage_ttl_days * 24 === logsS3RetentionPeriod
		) {
			isLogsSaveDisabled = true;
		}

		return [
			isMetricsSaveDisabled,
			isTracesSaveDisabled,
			isLogsSaveDisabled,
			errorText,
		];
	}, [
		logsCurrentTTLValues.cold_storage_ttl_days,
		logsCurrentTTLValues.default_ttl_days,
		logsS3RetentionPeriod,
		logsTotalRetentionPeriod,
		metricsCurrentTTLValues.metrics_move_ttl_duration_hrs,
		metricsCurrentTTLValues?.metrics_ttl_duration_hrs,
		metricsS3RetentionPeriod,
		metricsTotalRetentionPeriod,
		s3Enabled,
		t,
		tracesCurrentTTLValues.traces_move_ttl_duration_hrs,
		tracesCurrentTTLValues.traces_ttl_duration_hrs,
		tracesS3RetentionPeriod,
		tracesTotalRetentionPeriod,
	]);

	// eslint-disable-next-line sonarjs/cognitive-complexity
	const onOkHandler = async (type: TTTLType): Promise<void> => {
		let apiCallTotalRetention;
		let apiCallS3Retention;

		switch (type) {
			case 'metrics': {
				apiCallTotalRetention = metricsTotalRetentionPeriod;
				apiCallS3Retention = metricsS3RetentionPeriod;
				break;
			}
			case 'traces': {
				apiCallTotalRetention = tracesTotalRetentionPeriod;
				apiCallS3Retention = tracesS3RetentionPeriod;
				break;
			}
			case 'logs': {
				apiCallTotalRetention = logsTotalRetentionPeriod;
				apiCallS3Retention = logsS3RetentionPeriod;
				break;
			}
			default: {
				break;
			}
		}
		try {
			onPostApiLoadingHandler(type);
			let hasSetTTLFailed = false;

			try {
				if (type === 'logs') {
					// Only send S3 values if user has specified a duration
					const s3RetentionDays =
						apiCallS3Retention && apiCallS3Retention > 0
							? apiCallS3Retention / 24
							: 0;

					await setRetentionApiV2({
						type,
						defaultTTLDays: apiCallTotalRetention ? apiCallTotalRetention / 24 : -1, // convert Hours to days
						coldStorageVolume: s3RetentionDays > 0 ? 's3' : '',
						coldStorageDurationDays: s3RetentionDays,
						ttlConditions: [],
					});
				} else {
					await setRetentionApi(
						buildSetRetentionProps({
							type,
							totalRetentionHours: apiCallTotalRetention,
							s3RetentionHours: apiCallS3Retention,
							s3Enabled,
						}),
					);
				}
			} catch (error) {
				hasSetTTLFailed = true;
				if ((error as APIError).getHttpStatusCode() === StatusCodes.CONFLICT) {
					notifications.error({
						message: 'Error',
						description: t('retention_request_race_condition'),
						placement: 'topRight',
					});
				} else {
					notifications.error({
						message: 'Error',
						description: (error as APIError).getErrorMessage(),
						placement: 'topRight',
					});
				}
			}

			if (type === 'metrics') {
				metricsTtlValuesRefetch();

				if (!hasSetTTLFailed) {
					// Updates the currentTTL Values in order to avoid pushing the same values.
					setMetricsCurrentTTLValues({
						metrics_ttl_duration_hrs: metricsTotalRetentionPeriod || -1,
						metrics_move_ttl_duration_hrs: metricsS3RetentionPeriod || -1,
						status: '',
					});
				}
			} else if (type === 'traces') {
				tracesTtlValuesRefetch();

				if (!hasSetTTLFailed) {
					// Updates the currentTTL Values in order to avoid pushing the same values.
					setTracesCurrentTTLValues({
						traces_ttl_duration_hrs: tracesTotalRetentionPeriod || -1,
						traces_move_ttl_duration_hrs: tracesS3RetentionPeriod || -1,
						status: '',
					});
				}
			} else if (type === 'logs') {
				logsTtlValuesRefetch();
				if (!hasSetTTLFailed) {
					// Updates the currentTTL Values in order to avoid pushing the same values.
					setLogsCurrentTTLValues((prev) => ({
						...prev,
						cold_storage_ttl_days: logsS3RetentionPeriod
							? logsS3RetentionPeriod / 24
							: -1,
						default_ttl_days: logsTotalRetentionPeriod
							? logsTotalRetentionPeriod / 24 // convert Hours to days
							: -1,
					}));
				}
			}
		} catch (error) {
			notifications.error({
				message: 'Error',
				description: t('retention_failed_message'),
				placement: 'topRight',
			});
		}

		onPostApiLoadingHandler(type);
		onModalToggleHandler(type);
	};

	const { isCloudUser: isCloudUserVal } = useGetTenantLicense();

	const isAdmin = user.role === USER_ROLES.ADMIN;
	const showCustomDomainSettings = isCloudUserVal && isAdmin;

	const getSaveDisabledReason = (
		name: string,
		totalRetentionPeriod: NumberOrNull,
		s3RetentionPeriod: NumberOrNull,
	): string => {
		if (
			s3Enabled &&
			(totalRetentionPeriod || s3RetentionPeriod) &&
			Number(totalRetentionPeriod) <= Number(s3RetentionPeriod)
		) {
			return t('retention_comparison_error', { name });
		}
		if (
			!metricsTotalRetentionPeriod ||
			!tracesTotalRetentionPeriod ||
			!logsTotalRetentionPeriod
		) {
			return errorText;
		}
		return 'Change the retention period first';
	};

	const renderConfig = [
		{
			name: 'Metrics',
			type: 'metrics',
			icon: <BarChart3 />,
			retentionFields: [
				{
					name: t('total_retention_period'),
					value: metricsTotalRetentionPeriod,
					setValue: setMetricsTotalRetentionPeriod,
				},
				{
					name: t('move_to_s3'),
					value: metricsS3RetentionPeriod,
					setValue: setMetricsS3RetentionPeriod,
					hide: !s3Enabled,
				},
			],
			save: {
				modal: modalMetrics,
				modalOpen: (): void => onClickSaveHandler('metrics'),
				apiLoading: postApiLoadingMetrics,
				saveButtonText:
					metricsTtlValuesPayload.status === 'pending' ? (
						<span>{t('retention_save_button.pending', { name: 'metrics' })}</span>
					) : (
						<span>{t('retention_save_button.success')}</span>
					),
				isLoading: metricsTtlValuesPayload.status === 'pending',
				isDisabled: isMetricsSaveDisabled,
				disabledReason: getSaveDisabledReason(
					'metrics',
					metricsTotalRetentionPeriod,
					metricsS3RetentionPeriod,
				),
			},
			statusComponent: (
				<StatusMessage
					total_retention={metricsTtlValuesPayload.expected_metrics_ttl_duration_hrs}
					status={metricsTtlValuesPayload.status}
					s3_retention={
						metricsTtlValuesPayload.expected_metrics_move_ttl_duration_hrs
					}
				/>
			),
		},
		{
			name: 'Traces',
			type: 'traces',
			icon: <Compass />,
			retentionFields: [
				{
					name: t('total_retention_period'),
					value: tracesTotalRetentionPeriod,
					setValue: setTracesTotalRetentionPeriod,
				},
				{
					name: t('move_to_s3'),
					value: tracesS3RetentionPeriod,
					setValue: setTracesS3RetentionPeriod,
					hide: !s3Enabled,
				},
			],
			save: {
				modal: modalTraces,
				modalOpen: (): void => onClickSaveHandler('traces'),
				apiLoading: postApiLoadingTraces,
				saveButtonText:
					tracesTtlValuesPayload.status === 'pending' ? (
						<span>{t('retention_save_button.pending', { name: 'traces' })}</span>
					) : (
						<span>{t('retention_save_button.success')}</span>
					),
				isLoading: tracesTtlValuesPayload.status === 'pending',
				isDisabled: isTracesSaveDisabled,
				disabledReason: getSaveDisabledReason(
					'traces',
					tracesTotalRetentionPeriod,
					tracesS3RetentionPeriod,
				),
			},
			statusComponent: (
				<StatusMessage
					total_retention={tracesTtlValuesPayload.expected_traces_ttl_duration_hrs}
					status={tracesTtlValuesPayload.status}
					s3_retention={tracesTtlValuesPayload.expected_traces_move_ttl_duration_hrs}
				/>
			),
		},
		{
			name: 'Logs',
			type: 'logs',
			icon: <ScrollText />,
			retentionFields: [
				{
					name: t('total_retention_period'),
					value: logsTotalRetentionPeriod,
					setValue: setLogsTotalRetentionPeriod,
				},
				{
					name: t('move_to_s3'),
					value: logsS3RetentionPeriod,
					setValue: setLogsS3RetentionPeriod,
					hide: !s3Enabled,
					isS3Field: true,
				},
			],
			save: {
				modal: modalLogs,
				modalOpen: (): void => onClickSaveHandler('logs'),
				apiLoading: postApiLoadingLogs,
				saveButtonText:
					logsTtlValuesPayload.status === 'pending' ? (
						<span>{t('retention_save_button.pending', { name: 'logs' })}</span>
					) : (
						<span>{t('retention_save_button.success')}</span>
					),
				isLoading: logsTtlValuesPayload.status === 'pending',
				isDisabled: isLogsSaveDisabled,
				disabledReason: getSaveDisabledReason(
					'logs',
					logsTotalRetentionPeriod,
					logsS3RetentionPeriod,
				),
			},
			statusComponent: (
				<StatusMessage
					total_retention={logsTtlValuesPayload.expected_logs_ttl_duration_hrs}
					status={logsTtlValuesPayload.status}
					s3_retention={logsTtlValuesPayload.expected_logs_move_ttl_duration_hrs}
				/>
			),
		},
	].map((category): JSX.Element | null => {
		if (
			Array.isArray(category.retentionFields) &&
			category.retentionFields.length > 0
		) {
			const categoryType = category.name.toLowerCase() as TTTLType;
			return (
				<Fragment key={category.name}>
					<div
						data-testid={`retention-row-${categoryType}`}
						className="retention-row fs-ui tw:flex tw:flex-wrap tw:items-end tw:justify-between tw:gap-3 tw:border-t tw:border-border tw:px-5 tw:py-3 tw:font-sans tw:first:border-t-0"
					>
						<span className="retention-row-label tw:flex tw:h-9 tw:items-center tw:gap-2 tw:text-sm tw:font-medium tw:text-foreground tw:[&_svg]:size-4 tw:[&_svg]:text-muted-foreground">
							{category.icon}
							{category.name}
						</span>
						<div className="retention-row-controls tw:flex tw:flex-wrap tw:items-end tw:gap-3">
							{category.retentionFields.map((field, index) => (
								<Retention
									key={field.name}
									field={index === 0 ? 'total' : 's3'}
									type={category.type as TTTLType}
									text={field.name}
									retentionValue={field.value}
									setRetentionValue={field.setValue}
									hide={!!field.hide}
									isS3Field={'isS3Field' in field && !!field.isS3Field}
								/>
							))}
							{!isCloudUserVal && (
								<RetentionSaveButton
									testId={`retention-${categoryType}-save`}
									disabledReason={category.save.disabledReason}
									onClick={category.save.modalOpen}
									disabled={category.save.isDisabled}
									loading={category.save.isLoading}
								>
									{category.save.saveButtonText}
								</RetentionSaveButton>
							)}
						</div>
					</div>

					{!isCloudUserVal && category.statusComponent}

					{!isCloudUserVal && (
						<RetentionConfirmDialog
							open={category.save.modal}
							title={t('retention_confirmation')}
							description={t('retention_confirmation_description', {
								name: categoryType,
							})}
							loading={category.save.apiLoading}
							onCancel={(): void => onModalToggleHandler(categoryType)}
							onConfirm={(): Promise<void> => onOkHandler(categoryType)}
						/>
					)}
				</Fragment>
			);
		}
		return null;
	});

	return (
		<SettingsPageShell
			testId="general-settings"
			title="Workspace"
			description="Manage your workspace settings."
			narrow
		>
			{(showCustomDomainSettings || activeLicense) && (
				<div className="custom-domain-card">
					{showCustomDomainSettings && <CustomDomainSettings />}
					{showCustomDomainSettings && activeLicense && (
						<div className="custom-domain-card-divider" />
					)}
					{activeLicense && (
						<AuthZGuardContent
							checks={[buildLicenseReadPermission(activeLicense.id)]}
						>
							<>
								<LicenseKeyRow />
								<LicenseRowDismissibleCallout />
							</>
						</AuthZGuardContent>
					)}
				</div>
			)}

			<ContentPanel
				title="Retention Controls"
				subtitle="How long FuseScope keeps each signal before deleting it."
				actions={
					!isCloudUserVal && (
						<TextToolTip
							{...{
								text: `More details on how to set retention period`,
								url: fuseScopeDocsUrl('/administration/retention/'),
							}}
						/>
					)
				}
				footer={
					errorText && (
						<span
							data-testid="retention-error-text"
							className="retention-error-text tw:text-xs tw:text-warning-ink"
						>
							{errorText}
						</span>
					)
				}
				divided
				testId="retention-controls"
			>
				{renderConfig}
			</ContentPanel>

			{isCloudUserVal && <GeneralSettingsCloud />}
		</SettingsPageShell>
	);
}

interface GeneralSettingsProps {
	getAvailableDiskPayload: GetDisksPayload;
	metricsTtlValuesPayload: GetRetentionPeriodMetricsPayload;
	tracesTtlValuesPayload: GetRetentionPeriodTracesPayload;
	logsTtlValuesPayload: GetRetentionPeriodLogsPayload;
	metricsTtlValuesRefetch: UseQueryResult<
		ErrorResponse | SuccessResponse<GetRetentionPeriodMetricsPayload>
	>['refetch'];
	tracesTtlValuesRefetch: UseQueryResult<
		ErrorResponse | SuccessResponse<GetRetentionPeriodTracesPayload>
	>['refetch'];
	logsTtlValuesRefetch: UseQueryResult<
		ErrorResponseV2 | SuccessResponseV2<GetRetentionPeriodLogsPayload>
	>['refetch'];
}

export default GeneralSettings;
