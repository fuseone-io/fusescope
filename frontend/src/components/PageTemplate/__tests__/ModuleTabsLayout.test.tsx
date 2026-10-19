import { Router } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TabRoutes } from 'components/RouteTab/types';
import { createMemoryHistory, MemoryHistory } from 'history';

import ModuleTabsLayout from '../components/ModuleTabsLayout';

jest.mock('components/HeaderRightSection/HeaderRightSection', () => ({
	__esModule: true,
	default: (): JSX.Element => <div data-testid="header-right-section" />,
}));

const mockShowsGlobalTimePicker = jest.fn(() => false);
const mockShowsHeaderActionsOnly = jest.fn(() => false);

jest.mock('components/AppHeader/utils', () => ({
	showsGlobalTimePicker: (): boolean => mockShowsGlobalTimePicker(),
	showsHeaderActionsOnly: (): boolean => mockShowsHeaderActionsOnly(),
}));

jest.mock('components/OverlayScrollbar/OverlayScrollbar', () => ({
	__esModule: true,
	default: ({ children }: { children: JSX.Element }): JSX.Element => children,
}));

function ExplorerPane(): JSX.Element {
	return <p>explorer body</p>;
}

function ViewsPane(): JSX.Element {
	return <p>views body</p>;
}

function DetailPane(): JSX.Element {
	return <p>detail body</p>;
}

const routes: TabRoutes[] = [
	{
		name: 'Explorer',
		route: '/logs/explorer',
		key: '/logs/explorer',
		Component: ExplorerPane,
	},
	{
		name: 'Views',
		route: '/logs/views',
		key: '/logs/views',
		Component: ViewsPane,
	},
	{
		name: 'Detail',
		route: '/logs/detail/:id',
		key: '/logs/detail',
		Component: DetailPane,
	},
];

// Radix tabs activate on mousedown, not click.
function select(tab: HTMLElement): void {
	fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
}

function renderLayout(
	path: string,
	props: Partial<Parameters<typeof ModuleTabsLayout>[0]> = {},
): MemoryHistory {
	const history = createMemoryHistory({ initialEntries: [path] });
	render(
		<Router history={history}>
			<ModuleTabsLayout
				title="Logs"
				icon={<svg />}
				routes={routes}
				activeKey={path}
				history={history}
				{...props}
			/>
		</Router>,
	);
	return history;
}

describe('ModuleTabsLayout', () => {
	it('renders the title, one route tab per route and only the active pane', () => {
		renderLayout('/logs/views', { description: '7 saved views' });

		expect(screen.getByRole('heading', { level: 1, name: 'Logs' })).toBeVisible();
		expect(screen.getByText('7 saved views')).toBeInTheDocument();
		expect(screen.getByRole('tablist', { name: 'Logs sections' })).toHaveClass(
			'fs-ui',
		);
		expect(screen.getAllByRole('tab')).toHaveLength(3);
		expect(screen.getByRole('tab', { name: 'Views' })).toHaveAttribute(
			'aria-selected',
			'true',
		);
		expect(screen.getByRole('tab', { name: 'Views' })).toHaveAttribute(
			'data-route-key',
			'/logs/views',
		);
		expect(screen.getByText('views body')).toBeInTheDocument();
		expect(screen.queryByText('explorer body')).not.toBeInTheDocument();
	});

	it('renders a route icon before its name, keeping the accessible name', () => {
		renderLayout('/logs/explorer', {
			routes: [
				{ ...routes[0], icon: <svg data-testid="explorer-tab-icon" /> },
				routes[1],
			],
		});

		const tab = screen.getByRole('tab', { name: 'Explorer' });
		expect(within(tab).getByTestId('explorer-tab-icon')).toBeInTheDocument();
		expect(
			within(screen.getByRole('tab', { name: 'Views' })).queryByRole('img'),
		).not.toBeInTheDocument();
	});

	it('falls back to activeKey when no route matches the path', () => {
		renderLayout('/logs/views/extra', { activeKey: '/logs/explorer' });

		expect(screen.getByRole('tab', { name: 'Explorer' })).toHaveAttribute(
			'aria-selected',
			'true',
		);
		expect(screen.getByText('explorer body')).toBeInTheDocument();
	});

	it('pushes the selected route and reports the key', () => {
		const onChangeHandler = jest.fn();
		const history = renderLayout('/logs/explorer', { onChangeHandler });

		select(screen.getByRole('tab', { name: 'Views' }));

		expect(onChangeHandler).toHaveBeenCalledWith('/logs/views');
		expect(history.location.pathname).toBe('/logs/views');
		expect(screen.getByText('views body')).toBeInTheDocument();
	});

	it('shows the page actions unless the app header already does', () => {
		renderLayout('/logs/explorer');
		expect(screen.getByTestId('header-right-section')).toBeInTheDocument();
	});

	it('leaves the page actions to the app header when it shows the picker', () => {
		mockShowsGlobalTimePicker.mockReturnValueOnce(true);
		renderLayout('/logs/explorer');
		expect(screen.queryByTestId('header-right-section')).not.toBeInTheDocument();
	});

	it('leaves the page actions to the app header when it shows them alone', () => {
		mockShowsHeaderActionsOnly.mockReturnValueOnce(true);
		renderLayout('/logs/explorer');
		expect(screen.queryByTestId('header-right-section')).not.toBeInTheDocument();
	});

	it('renders custom actions in place of the default ones', () => {
		renderLayout('/logs/explorer', {
			actions: <button type="button">Act</button>,
		});

		expect(screen.getByRole('button', { name: 'Act' })).toBeInTheDocument();
		expect(screen.queryByTestId('header-right-section')).not.toBeInTheDocument();
	});
});
