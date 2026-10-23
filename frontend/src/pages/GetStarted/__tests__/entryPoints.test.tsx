import { Route, Switch } from 'react-router-dom';
import ROUTES from 'constants/routes';
import HomeChecklist from 'container/Home/HomeChecklist/HomeChecklist';
import IngestionPanel from 'container/Home/components/IngestionPanel';
import ServicesWidget from 'container/Home/Services/ServicesWidget';
import { defaultChecklistItemsState } from 'container/Home/constants';
import DataSourcesButton from 'container/Integrations/IntegrationsHeader/DataSourcesButton';
import MetricsEmptyState from 'container/MetricsExplorer/Summary/MetricsEmptyState';
import NoLogs from 'container/NoLogs/NoLogs';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { render, screen, userEvent } from 'tests/test-utils';
import { DataSource } from 'types/common/queryBuilder';

const mockPush = jest.fn();

jest.mock('lib/history', () => ({
	__esModule: true,
	default: {
		push: (...args: unknown[]): void => mockPush(...args),
		location: { pathname: '/home' },
	},
}));

jest.mock('hooks/useGetTenantLicense', () => ({
	useGetTenantLicense: jest.fn(),
}));

const COMMUNITY = {
	isCloudUser: false,
	isEnterpriseSelfHostedUser: false,
	isCommunityUser: true,
	isCommunityEnterpriseUser: false,
};

const open = jest.spyOn(window, 'open').mockReturnValue(null);

beforeEach(() => {
	jest.mocked(useGetTenantLicense).mockReturnValue(COMMUNITY);
	mockPush.mockClear();
	open.mockClear();
});

/** Self-hosted workspaces open the in-app catalog instead of the docs. */
describe('community entry points open /get-started', () => {
	it('Home: Connect data source', async () => {
		render(
			<IngestionPanel
				signals={{ logs: true, traces: false, metrics: false }}
				logRecords={10}
				spans={0}
				canConnect
			/>,
			undefined,
			{ appContextOverrides: { activeLicense: null } },
		);

		await userEvent.click(
			screen.getByRole('button', { name: /connect data source/i }),
		);

		expect(mockPush).toHaveBeenCalledWith(ROUTES.GET_STARTED);
		expect(open).not.toHaveBeenCalled();
	});

	it('Home: the checklist step to add a data source', async () => {
		render(
			<HomeChecklist
				checklistItems={defaultChecklistItemsState.filter(
					(item) => item.id === 'ADD_DATA_SOURCE',
				)}
				onSkip={jest.fn()}
				isLoading={false}
			/>,
			undefined,
			{ appContextOverrides: { activeLicense: null } },
		);

		await userEvent.click(screen.getByRole('button', { name: /get started/i }));

		expect(mockPush).toHaveBeenCalledWith(ROUTES.GET_STARTED);
		expect(open).not.toHaveBeenCalled();
	});

	it('Home: the services widget', async () => {
		render(
			<ServicesWidget
				source="Service Traces"
				rows={[]}
				pending={false}
				selectedInterval={0}
				onIntervalChange={jest.fn()}
			/>,
			undefined,
			{ appContextOverrides: { activeLicense: null } },
		);

		await userEvent.click(screen.getByRole('button', { name: /get started/i }));

		expect(mockPush).toHaveBeenCalledWith(ROUTES.GET_STARTED);
	});

	it.each([DataSource.LOGS, DataSource.TRACES])(
		'the %s empty state',
		async (dataSource) => {
			render(<NoLogs dataSource={dataSource} />);

			await userEvent.click(
				screen.getByText(`Sending ${dataSource} to FuseScope`),
			);

			expect(mockPush).toHaveBeenCalledWith(ROUTES.GET_STARTED);
			expect(open).not.toHaveBeenCalled();
		},
	);

	it('the metrics empty state', () => {
		render(<MetricsEmptyState />);

		expect(
			screen.getByRole('link', { name: /sending metrics to fusescope/i }),
		).toHaveAttribute('href', ROUTES.GET_STARTED);
	});

	it('the Integrations data sources button', async () => {
		render(
			<Switch>
				<Route exact path={ROUTES.INTEGRATIONS}>
					<DataSourcesButton />
				</Route>
				<Route path={ROUTES.GET_STARTED}>
					<div data-testid="get-started-route" />
				</Route>
			</Switch>,
			undefined,
			{ initialRoute: ROUTES.INTEGRATIONS },
		);

		await userEvent.click(screen.getByTestId('integrations-data-sources'));

		expect(screen.getByTestId('get-started-route')).toBeInTheDocument();
	});
});
