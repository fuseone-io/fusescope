import { ReactNode } from 'react';
// eslint-disable-next-line no-restricted-imports
import { Provider } from 'react-redux';
import { HelmetProvider } from 'react-helmet-async';
import { MockedRequest } from 'msw';
import { server } from 'mocks-server/server';
import configureStore from 'redux-mock-store';
import thunk from 'redux-thunk';
import store from 'store';
import { render, waitFor } from 'tests/test-utils';

import AppLayout from '../index';

jest.mock('components/AppHeader/AppHeader', () => ({
	__esModule: true,
	default: (): null => null,
}));
jest.mock('components/AppSidebar/AppSidebar', () => ({
	__esModule: true,
	default: (): null => null,
}));
jest.mock('components/AppSidebar/AppSidebarProvider', () => ({
	__esModule: true,
	default: ({ children }: { children: ReactNode }): ReactNode => children,
}));
jest.mock('providers/cmdKProvider', () => ({
	useCmdK: (): Record<string, unknown> => ({
		open: false,
		setOpen: jest.fn(),
		openCmdK: jest.fn(),
		closeCmdK: jest.fn(),
	}),
}));

const versionedStore = configureStore([thunk])({
	...store.getState(),
	app: {
		...store.getState().app,
		isLoggedIn: true,
		currentVersion: 'v0.151.0',
		latestVersion: 'v0.151.0',
	},
});

describe('AppLayout release notes', () => {
	it('does not fetch release notes from SigNoz', async () => {
		const urls: string[] = [];
		const record = (req: MockedRequest): void => {
			urls.push(req.url.href);
		};
		server.events.on('request:start', record);

		render(
			<HelmetProvider>
				<Provider store={versionedStore}>
					<AppLayout>
						<div />
					</AppLayout>
				</Provider>
			</HelmetProvider>,
		);

		await waitFor(() =>
			expect(urls.some((url) => url.includes('/version'))).toBe(true),
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 50);
		});
		server.events.removeListener('request:start', record);

		expect(urls.filter((url) => url.includes('signoz.cloud'))).toStrictEqual([]);
	});
});
