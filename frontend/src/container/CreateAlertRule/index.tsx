import { useCallback, useEffect, useMemo } from 'react';
import { Form } from 'antd';
import logEvent from 'api/common/logEvent';
import SubpageHeader from 'components/Alerts/SubpageHeader/SubpageHeader';
import { ENTITY_VERSION_V5 } from 'constants/app';
import { QueryParams } from 'constants/query';
import ROUTES from 'constants/routes';
import CreateAlertV2 from 'container/CreateAlertV2';
import FormAlertRules, { AlertDetectionTypes } from 'container/FormAlertRules';
import { useGetCompositeQueryParam } from 'hooks/queryBuilder/useGetCompositeQueryParam';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import useUrlQuery from 'hooks/useUrlQuery';
import { AlertListTabs } from 'pages/AlertList/types';
import { AlertTypes } from 'types/api/alerts/alertTypes';
import { AlertDef } from 'types/api/alerts/def';

import { ALERT_TYPE_VS_SOURCE_MAPPING } from './config';
import AlertTypeBadge from './AlertTypeBadge';
import { ALERTS_VALUES_MAP } from './defaults';
import SelectAlertType from './SelectAlertType';

import './CreateAlertRule.styles.scss';

function CreateRules(): JSX.Element {
	const [formInstance] = Form.useForm();
	const compositeQuery = useGetCompositeQueryParam();
	const queryParams = useUrlQuery();
	const { safeNavigate } = useSafeNavigate();

	const ruleTypeFromURL = queryParams.get(QueryParams.ruleType);
	const alertTypeFromURL = queryParams.get(QueryParams.alertType);
	const version = queryParams.get(QueryParams.version);
	const showClassicCreateAlertsPageFlag =
		queryParams.get(QueryParams.showClassicCreateAlertsPage) === 'true';

	const isTypeSelectionMode =
		!alertTypeFromURL && !ruleTypeFromURL && !compositeQuery;

	useEffect(() => {
		if (isTypeSelectionMode) {
			logEvent('Alert: New alert data source selection page visited', {});
		}
	}, [isTypeSelectionMode]);

	const alertType = useMemo(() => {
		if (ruleTypeFromURL === AlertDetectionTypes.ANOMALY_DETECTION_ALERT) {
			return AlertTypes.ANOMALY_BASED_ALERT;
		}
		if (!alertTypeFromURL) {
			const dataSource = compositeQuery?.builder.queryData?.[0]?.dataSource;
			if (dataSource) {
				return ALERT_TYPE_VS_SOURCE_MAPPING[dataSource];
			}
			return AlertTypes.METRICS_BASED_ALERT;
		}
		return alertTypeFromURL as AlertTypes;
	}, [alertTypeFromURL, ruleTypeFromURL, compositeQuery?.builder.queryData]);

	const initialAlertValue: AlertDef = useMemo(
		() => ({
			...ALERTS_VALUES_MAP[alertType],
			version: version || ENTITY_VERSION_V5,
		}),
		[alertType, version],
	);

	const handleSelectType = useCallback(
		(type: AlertTypes, newTab?: boolean): void => {
			if (type === AlertTypes.ANOMALY_BASED_ALERT) {
				queryParams.set(
					QueryParams.ruleType,
					AlertDetectionTypes.ANOMALY_DETECTION_ALERT,
				);
				queryParams.set(QueryParams.alertType, AlertTypes.METRICS_BASED_ALERT);
			} else {
				queryParams.set(QueryParams.ruleType, AlertDetectionTypes.THRESHOLD_ALERT);
				queryParams.set(QueryParams.alertType, type);
			}

			safeNavigate(`${ROUTES.ALERTS_NEW}?${queryParams.toString()}`, { newTab });
		},
		[queryParams, safeNavigate],
	);

	const alertContent = useMemo(() => {
		if (isTypeSelectionMode) {
			return <SelectAlertType onSelect={handleSelectType} />;
		}

		if (
			showClassicCreateAlertsPageFlag ||
			alertType === AlertTypes.ANOMALY_BASED_ALERT
		) {
			return (
				<FormAlertRules
					alertType={alertType}
					formInstance={formInstance}
					initialValue={initialAlertValue}
					ruleId=""
				/>
			);
		}
		return <CreateAlertV2 alertType={alertType} />;
	}, [
		isTypeSelectionMode,
		handleSelectType,
		showClassicCreateAlertsPageFlag,
		alertType,
		formInstance,
		initialAlertValue,
	]);

	if (
		!isTypeSelectionMode &&
		!showClassicCreateAlertsPageFlag &&
		alertType !== AlertTypes.ANOMALY_BASED_ALERT
	) {
		return (
			<div
				data-testid="create-alert-page"
				className="tw:flex tw:min-h-full tw:w-full tw:flex-col tw:self-start"
			>
				{alertContent}
			</div>
		);
	}

	return (
		<div
			data-testid="create-alert-page"
			className="tw:flex tw:min-h-full tw:w-full tw:flex-col tw:self-start tw:bg-background tw:text-foreground"
		>
			<SubpageHeader
				title="New Alert Rule"
				backLabel="Back to alert rules"
				onBack={(): void =>
					safeNavigate(`${ROUTES.LIST_ALL_ALERT}?tab=${AlertListTabs.ALERT_RULES}`)
				}
				badges={
					isTypeSelectionMode ? undefined : <AlertTypeBadge alertType={alertType} />
				}
			/>
			<div className="create-alert-wrapper tw:mx-auto tw:box-border tw:flex tw:w-full tw:max-w-[1600px] tw:flex-1 tw:flex-col tw:px-4 tw:pt-5 tw:md:px-6">
				{alertContent}
			</div>
		</div>
	);
}

export default CreateRules;
