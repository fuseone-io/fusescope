import React, { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import classNames from 'classnames';
import AlertBreadcrumb from 'components/AlertBreadcrumb';
import { Filters } from 'components/AlertDetailsFilters/Filters';
import PageTabs from 'components/PageTemplate/components/PageTabs';
import Spinner from 'components/Spinner';
import { QueryParams } from 'constants/query';
import ROUTES from 'constants/routes';
import { CreateAlertProvider } from 'container/CreateAlertV2/context';
import { getCreateAlertLocalStateFromAlertDef } from 'container/CreateAlertV2/utils';
import useUrlQuery from 'hooks/useUrlQuery';
import history from 'lib/history';
import { useAlertRule } from 'providers/Alert';
import { AlertTypes } from 'types/api/alerts/alertTypes';
import { NEW_ALERT_SCHEMA_VERSION } from 'types/api/alerts/alertTypesV2';
import { fromRuleDTOToPostableRuleV2 } from 'types/api/alerts/convert';

import AlertHeader from './AlertHeader/AlertHeader';
import AlertNotFound from './AlertNotFound';
import { useGetAlertRuleDetails, useRouteTabUtils } from './hooks';

import './AlertDetails.styles.scss';

function AlertDetails(): JSX.Element {
	const { pathname } = useLocation();
	const { routes } = useRouteTabUtils();
	const params = useUrlQuery();
	const { alertRuleName } = useAlertRule();

	const { isLoading, isError, ruleId, isValidRuleId, alertDetailsResponse } =
		useGetAlertRuleDetails();

	const isTestAlert = useMemo(() => {
		return params.get(QueryParams.isTestAlert) === 'true';
	}, [params]);

	const getDocumentTitle = useMemo(() => {
		const alertTitle = alertRuleName ?? alertDetailsResponse?.data?.alert;
		if (alertTitle) {
			return alertTitle;
		}
		if (isTestAlert) {
			return 'Test Alert';
		}
		if (isLoading) {
			return document.title;
		}
		return 'Alert Not Found';
	}, [alertRuleName, alertDetailsResponse?.data?.alert, isTestAlert, isLoading]);

	useEffect(() => {
		document.title = getDocumentTitle;
	}, [getDocumentTitle]);

	const alertRuleDetails = useMemo(
		() =>
			alertDetailsResponse?.data
				? fromRuleDTOToPostableRuleV2(alertDetailsResponse.data)
				: undefined,
		[alertDetailsResponse],
	);

	const initialAlertState = useMemo(
		() => getCreateAlertLocalStateFromAlertDef(alertRuleDetails),
		[alertRuleDetails],
	);

	if (isError || !isValidRuleId || (!isLoading && !alertRuleDetails)) {
		return <AlertNotFound isTestAlert={isTestAlert} />;
	}

	const handleTabChange = (key: string): void => {
		if (key === ROUTES.ALERT_HISTORY) {
			logEvent('Alert History tab: Visited', { ruleId });
		}
		const selected = routes.find((route) => route.key === key);
		if (selected) {
			history.push(selected.route);
		}
	};

	const activeTab =
		routes.find((route) => route.key === pathname)?.key ?? ROUTES.ALERT_OVERVIEW;

	const isV2Alert = alertRuleDetails?.schemaVersion === NEW_ALERT_SCHEMA_VERSION;

	// Show spinner until we have alert data loaded
	if (isLoading && !alertRuleDetails) {
		return <Spinner />;
	}

	return (
		<CreateAlertProvider
			ruleId={ruleId || ''}
			isEditMode
			initialAlertType={alertRuleDetails?.alertType as AlertTypes}
			initialAlertState={initialAlertState}
		>
			<div
				className={classNames('alert-details', { 'alert-details-v2': isV2Alert })}
				data-testid="alert-details-root"
				data-schema-version={isV2Alert ? NEW_ALERT_SCHEMA_VERSION : 'v1'}
			>
				<AlertBreadcrumb
					className="alert-details__breadcrumb"
					items={[
						{ title: 'Alert Rules', route: ROUTES.LIST_ALL_ALERT },
						{ title: ruleId, isLast: true },
					]}
				/>

				{alertRuleDetails && <AlertHeader alertDetails={alertRuleDetails} />}
				<div className="alert-details__tabs tw:relative">
					<div className="alert-details__filters">
						<Filters />
					</div>
					<PageTabs
						label="Alert rule sections"
						value={activeTab}
						onValueChange={handleTabChange}
						tabs={routes.map(({ Component, name, key }) => ({
							value: key,
							label: name,
							content: <Component />,
						}))}
					/>
				</div>
			</div>
		</CreateAlertProvider>
	);
}

export default AlertDetails;
