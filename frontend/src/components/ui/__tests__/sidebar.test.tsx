import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
	Sidebar,
	SidebarContent,
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from 'components/ui/sidebar';

import { mockMatchMedia } from './mockMatchMedia';

function renderSidebar(): void {
	render(
		<SidebarProvider>
			<Sidebar collapsible="icon">
				<SidebarContent>navigation</SidebarContent>
			</Sidebar>
			<SidebarInset>
				<SidebarTrigger data-testid="sidebar-trigger" />
			</SidebarInset>
		</SidebarProvider>,
	);
}

function sidebarState(): string | null {
	const sidebar = document.querySelector('[data-slot="sidebar"]');
	return sidebar?.getAttribute('data-state') ?? null;
}

describe('Sidebar', () => {
	beforeEach(() => {
		mockMatchMedia();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('starts expanded', () => {
		renderSidebar();

		expect(sidebarState()).toBe('expanded');
		expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
			'data-collapsible',
			'',
		);
	});

	it('toggles with the trigger button', async () => {
		const user = userEvent.setup();
		renderSidebar();

		await user.click(screen.getByTestId('sidebar-trigger'));
		expect(sidebarState()).toBe('collapsed');
		expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
			'data-collapsible',
			'icon',
		);

		await user.click(screen.getByTestId('sidebar-trigger'));
		expect(sidebarState()).toBe('expanded');
	});

	it.each([
		{ shortcut: 'Ctrl+B', modifier: { ctrlKey: true } },
		{ shortcut: '⌘+B', modifier: { metaKey: true } },
	])('toggles with $shortcut', ({ modifier }) => {
		renderSidebar();

		fireEvent.keyDown(window, { key: 'b', ...modifier });
		expect(sidebarState()).toBe('collapsed');

		fireEvent.keyDown(window, { key: 'b', ...modifier });
		expect(sidebarState()).toBe('expanded');
	});

	it('ignores B without a modifier', () => {
		renderSidebar();

		fireEvent.keyDown(window, { key: 'b' });
		expect(sidebarState()).toBe('expanded');
	});
});
