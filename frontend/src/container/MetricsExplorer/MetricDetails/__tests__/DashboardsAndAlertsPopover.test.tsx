import { fireEvent, render, screen } from '@testing-library/react';
import * as metricsExplorerHooks from 'api/generated/services/metrics';
import { QueryParams } from 'constants/query';

import DashboardsAndAlertsPopover from '../DashboardsAndAlertsPopover';
import {
	getMockAlertsData,
	getMockDashboardsData,
	MOCK_ALERT_1,
	MOCK_ALERT_2,
	MOCK_DASHBOARD_1,
	MOCK_DASHBOARD_2,
	MOCK_METRIC_NAME,
} from './testUtlls';

const mockWindowOpen = jest.fn();
Object.defineProperty(window, 'open', { value: mockWindowOpen });

const useGetMetricAlertsMock = jest.spyOn(
	metricsExplorerHooks,
	'useGetMetricAlerts',
);
const useGetMetricDashboardsMock = jest.spyOn(
	metricsExplorerHooks,
	'useGetMetricDashboardsV2',
);

describe('DashboardsAndAlertsPopover', () => {
	beforeEach(() => {
		useGetMetricAlertsMock.mockReturnValue(getMockAlertsData());
		useGetMetricDashboardsMock.mockReturnValue(getMockDashboardsData());
		mockWindowOpen.mockClear();
	});

	it('lists the dashboards and alert rules that use the metric by name', () => {
		render(<DashboardsAndAlertsPopover metricName={MOCK_METRIC_NAME} />);

		expect(screen.getByText('Used in')).toBeInTheDocument();
		expect(screen.getByText('2 dashboards — 2 alert rules')).toBeInTheDocument();
		expect(
			screen.getByRole('link', {
				name: new RegExp(MOCK_DASHBOARD_1.dashboardName),
			}),
		).toHaveAttribute('href', `/dashboard/${MOCK_DASHBOARD_1.dashboardId}`);
		expect(screen.getByText(MOCK_DASHBOARD_2.dashboardName)).toBeInTheDocument();
		expect(screen.getByText(MOCK_ALERT_1.alertName)).toBeInTheDocument();
		expect(screen.getByText(MOCK_ALERT_2.alertName)).toBeInTheDocument();
	});

	it('renders nothing with no dashboards and alerts', () => {
		useGetMetricAlertsMock.mockReturnValue(
			getMockAlertsData({
				data: {
					alerts: [],
				},
			}),
		);
		useGetMetricDashboardsMock.mockReturnValue(
			getMockDashboardsData({
				data: {
					dashboards: [],
				},
			}),
		);

		render(<DashboardsAndAlertsPopover metricName={MOCK_METRIC_NAME} />);

		expect(screen.queryByText('Used in')).not.toBeInTheDocument();
	});

	it('uses the singular for one dashboard and one alert rule', () => {
		useGetMetricAlertsMock.mockReturnValue(
			getMockAlertsData({ data: { alerts: [MOCK_ALERT_1] } }),
		);
		useGetMetricDashboardsMock.mockReturnValue(
			getMockDashboardsData({ data: { dashboards: [MOCK_DASHBOARD_1] } }),
		);

		render(<DashboardsAndAlertsPopover metricName={MOCK_METRIC_NAME} />);

		expect(screen.getByText('1 dashboard — 1 alert rule')).toBeInTheDocument();
	});

	it('falls back to the ids when names are missing', () => {
		useGetMetricAlertsMock.mockReturnValue(
			getMockAlertsData({
				data: { alerts: [{ alertId: 'rule-9', alertName: '' }] },
			}),
		);
		useGetMetricDashboardsMock.mockReturnValue(
			getMockDashboardsData({
				data: { dashboards: [{ ...MOCK_DASHBOARD_1, dashboardName: '' }] },
			}),
		);

		render(<DashboardsAndAlertsPopover metricName={MOCK_METRIC_NAME} />);

		expect(screen.getByText(MOCK_DASHBOARD_1.dashboardId)).toBeInTheDocument();
		expect(screen.getByText('rule-9')).toBeInTheDocument();
	});

	it('opens a dashboard in a new tab', () => {
		render(<DashboardsAndAlertsPopover metricName={MOCK_METRIC_NAME} />);

		fireEvent.click(screen.getByText(MOCK_DASHBOARD_1.dashboardName));

		expect(mockWindowOpen).toHaveBeenCalledWith(
			`/dashboard/${MOCK_DASHBOARD_1.dashboardId}`,
			'_blank',
		);
	});

	it('opens an alert rule in a new tab', () => {
		render(<DashboardsAndAlertsPopover metricName={MOCK_METRIC_NAME} />);

		fireEvent.click(screen.getByText(MOCK_ALERT_1.alertName));

		expect(mockWindowOpen).toHaveBeenCalledWith(
			`/alerts/overview?${QueryParams.ruleId}=${MOCK_ALERT_1.alertId}`,
			'_blank',
		);
	});

	it('collapses multiple panels of the same dashboard into one entry', () => {
		useGetMetricDashboardsMock.mockReturnValue(
			getMockDashboardsData({
				data: {
					dashboards: [
						MOCK_DASHBOARD_1,
						MOCK_DASHBOARD_2,
						{ ...MOCK_DASHBOARD_1, panelId: '3', panelName: 'Panel 3' },
					],
				},
			}),
		);

		render(<DashboardsAndAlertsPopover metricName={MOCK_METRIC_NAME} />);

		expect(screen.getByText('2 dashboards — 2 alert rules')).toBeInTheDocument();
		expect(screen.getAllByText(MOCK_DASHBOARD_1.dashboardName)).toHaveLength(1);
	});
});
