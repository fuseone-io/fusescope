import { useCallback, useEffect, useMemo } from 'react';
import { Form } from 'antd';
import logEvent from 'api/common/logEvent';
import AlertBreadcrumb from 'components/AlertBreadcrumb';
import { PageTab } from 'components/PageTemplate/types';
import { ENTITY_VERSION_V5 } from 'constants/app';
import { QueryParams } from 'constants/query';
import ROUTES from 'constants/routes';
import CreateAlertV2 from 'container/CreateAlertV2';
import FormAlertRules, { AlertDetectionTypes } from 'container/FormAlertRules';
import { useGetCompositeQueryParam } from 'hooks/queryBuilder/useGetCompositeQueryParam';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import useUrlQuery from 'hooks/useUrlQuery';
import AlertsPageShell from 'pages/AlertList/components/AlertsPageShell';
import { AlertListTabs } from 'pages/AlertList/types';
import { AlertTypes } from 'types/api/alerts/alertTypes';
import { AlertDef } from 'types/api/alerts/def';

import { ALERT_TYPE_VS_SOURCE_MAPPING } from './config';
import { ALERTS_VALUES_MAP, ALERT_TYPE_BREADCRUMB_TITLE } from './defaults';
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

	const handleTabChange = useCallback(
		(tab: string): void => {
			queryParams.set('tab', tab);
			queryParams.delete('subTab');
			queryParams.delete('search');
			safeNavigate(`${ROUTES.LIST_ALL_ALERT}?${queryParams.toString()}`);
		},
		[safeNavigate, queryParams],
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

	const tabs: PageTab[] = [
		{
			value: AlertListTabs.TRIGGERED_ALERTS,
			label: 'Triggered Alerts',
			content: null,
		},
		{
			value: AlertListTabs.ALERT_RULES,
			label: 'Alert Rules',
			content: (
				<div className="create-alert-wrapper">
					<AlertBreadcrumb
						className="create-alert__breadcrumb"
						showDivider={false}
						items={
							isTypeSelectionMode
								? [
										{
											title: 'Alert Rules',
											route: `${ROUTES.LIST_ALL_ALERT}?tab=${AlertListTabs.ALERT_RULES}`,
										},
										{ title: 'Select Alert Type', isLast: true },
									]
								: [
										{
											title: 'Alert Rules',
											route: `${ROUTES.LIST_ALL_ALERT}?tab=${AlertListTabs.ALERT_RULES}`,
										},
										{ title: 'Select Alert Type', route: ROUTES.ALERTS_NEW },
										{
											title: ALERT_TYPE_BREADCRUMB_TITLE[alertType],
											isLast: true,
										},
									]
						}
					/>
					{alertContent}
				</div>
			),
		},
		{
			value: AlertListTabs.CONFIGURATION,
			label: 'Configuration',
			content: null,
		},
	];

	return (
		<AlertsPageShell
			testId="create-alert-page"
			tabs={tabs}
			activeTab={AlertListTabs.ALERT_RULES}
			onTabChange={handleTabChange}
			showHeaderRightSection={false}
		/>
	);
}

export default CreateRules;
