import React, { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import classNames from 'classnames';
import { Filters } from 'components/AlertDetailsFilters/Filters';
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
import { Tabs as TabsPrimitive } from 'radix-ui';

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

	const tabTriggerClass =
		'tw:-mb-px tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-1.5 tw:border-b-2 tw:border-transparent tw:py-2.5 tw:text-sm tw:font-medium tw:whitespace-nowrap tw:text-muted-foreground! tw:transition-colors tw:outline-none tw:hover:text-foreground! tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:ring-inset tw:data-[state=active]:border-primary tw:data-[state=active]:text-primary!';

	const tabs = (
		<div className="tw:flex tw:flex-wrap tw:items-end tw:justify-between tw:gap-x-4 tw:gap-y-2">
			<TabsPrimitive.List
				aria-label="Alert rule sections"
				className="fs-ui tw:flex tw:gap-6 tw:overflow-x-auto tw:overflow-y-hidden tw:font-sans"
			>
				{routes.map(({ name, key }) => (
					<TabsPrimitive.Trigger
						key={key}
						value={key}
						data-testid={`page-tab-${key}`}
						className={tabTriggerClass}
					>
						{name}
					</TabsPrimitive.Trigger>
				))}
			</TabsPrimitive.List>
			<div className="alert-details__filters tw:pb-2">
				<Filters />
			</div>
		</div>
	);

	return (
		<CreateAlertProvider
			ruleId={ruleId || ''}
			isEditMode
			initialAlertType={alertRuleDetails?.alertType as AlertTypes}
			initialAlertState={initialAlertState}
		>
			<TabsPrimitive.Root
				value={activeTab}
				onValueChange={handleTabChange}
				className={classNames(
					'alert-details tw:flex tw:min-h-full tw:w-full tw:flex-col tw:self-start tw:bg-background tw:text-foreground',
					{ 'alert-details-v2': isV2Alert },
				)}
				data-testid="alert-details-root"
				data-schema-version={isV2Alert ? NEW_ALERT_SCHEMA_VERSION : 'v1'}
			>
				{alertRuleDetails && (
					<AlertHeader alertDetails={alertRuleDetails} tabs={tabs} />
				)}
				<div className="tw:mx-auto tw:box-border tw:flex tw:w-full tw:max-w-[1600px] tw:flex-1 tw:flex-col tw:px-4 tw:pt-5 tw:md:px-6">
					{routes.map(({ Component, key }) => (
						<TabsPrimitive.Content
							key={key}
							value={key}
							className="tw:min-w-0 tw:outline-none tw:data-[state=active]:flex tw:data-[state=active]:flex-1 tw:data-[state=active]:flex-col"
						>
							<Component />
						</TabsPrimitive.Content>
					))}
				</div>
			</TabsPrimitive.Root>
		</CreateAlertProvider>
	);
}

export default AlertDetails;
