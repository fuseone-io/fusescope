import type { Meta, StoryObj } from '@storybook/react-vite';
import { USER_PREFERENCES } from 'constants/userPreferences';
import { expect, userEvent, within } from 'storybook/test';
import { UserPreference } from 'types/api/preferences/preference';
import type { SignozStoryParameters, StoryTheme } from '@/storybook/types';

function Page(): JSX.Element {
	return <div data-testid="page-content" />;
}

function preference(name: string, value: unknown): UserPreference {
	return {
		name,
		description: name,
		valueType: typeof value,
		defaultValue: false,
		allowedValues: [],
		allowedScopes: ['user'],
		value,
	};
}

function shell(
	pinned: boolean,
	theme: StoryTheme,
	shortcuts: string[] = [],
): SignozStoryParameters {
	return {
		signoz: {
			layout: 'app',
			route: '/services',
			theme,
			appContext: {
				userPreferences: [
					preference(USER_PREFERENCES.SIDENAV_PINNED, pinned),
					preference(USER_PREFERENCES.NAV_SHORTCUTS, shortcuts),
				],
			},
		},
	};
}

function sidebarState(canvasElement: HTMLElement): string | null {
	return (
		canvasElement.ownerDocument
			.querySelector('[data-slot="sidebar"]')
			?.getAttribute('data-state') ?? null
	);
}

/**
 * The main navigation inside the app shell. It collapses to an icon rail and
 * expands only on request: the toggle, Ctrl/⌘+B or Shift+B. The state is the
 * `sidenav_pinned` user preference. Expanded, each group collapses from its
 * label; the state is kept in localStorage.
 */
const meta = {
	title: 'Components/App Sidebar',
	component: Page,
} satisfies Meta<typeof Page>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Expanded, light theme. */
export const ExpandedLight: Story = { parameters: shell(true, 'light') };

/** Expanded, dark theme. */
export const ExpandedDark: Story = { parameters: shell(true, 'dark') };

/** Collapsed to the icon rail, light theme. */
export const CollapsedLight: Story = { parameters: shell(false, 'light') };

/** Collapsed to the icon rail, dark theme. */
export const CollapsedDark: Story = { parameters: shell(false, 'dark') };

const SHORTCUTS = ['logs', 'traces', 'dashboards'];

/** Expanded with three shortcuts, light theme. */
export const WithShortcutsLight: Story = {
	parameters: shell(true, 'light', SHORTCUTS),
};

/** Expanded with three shortcuts, dark theme. */
export const WithShortcutsDark: Story = {
	parameters: shell(true, 'dark', SHORTCUTS),
};

/** A group collapses and expands from its label. */
export const CollapsesGroups: Story = {
	tags: ['play'],
	parameters: shell(true, 'light'),
	play: async ({ canvasElement }): Promise<void> => {
		const body = within(canvasElement.ownerDocument.body);
		const respond = await body.findByRole('button', { name: 'Respond' });

		await userEvent.click(respond);
		await expect(respond).toHaveAttribute('aria-expanded', 'false');
		await expect(
			body.queryByRole('link', { name: 'Alerts' }),
		).not.toBeInTheDocument();

		await userEvent.click(respond);
		await expect(respond).toHaveAttribute('aria-expanded', 'true');
		await expect(body.getByRole('link', { name: 'Alerts' })).toBeVisible();
	},
};

/**
 * Hovering the rail leaves it collapsed. Toggling writes the preference, which
 * Storybook's fixed app context does not feed back, so it is covered in Jest.
 */
export const StaysCollapsedOnHover: Story = {
	tags: ['play'],
	parameters: shell(false, 'light'),
	play: async ({ canvasElement }): Promise<void> => {
		const body = within(canvasElement.ownerDocument.body);

		await userEvent.hover(await body.findByTestId('nav-item-logs'));
		await expect(sidebarState(canvasElement)).toBe('collapsed');
	},
};
