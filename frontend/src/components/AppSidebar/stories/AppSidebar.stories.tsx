import type { Meta, StoryObj } from '@storybook/react-vite';
import { USER_PREFERENCES } from 'constants/userPreferences';
import { expect, userEvent, within } from 'storybook/test';
import type { SignozStoryParameters, StoryTheme } from '@/storybook/types';

function Page(): JSX.Element {
	return <div data-testid="page-content" />;
}

function shell(pinned: boolean, theme: StoryTheme): SignozStoryParameters {
	return {
		signoz: {
			layout: 'app',
			route: '/services',
			theme,
			appContext: {
				userPreferences: [
					{
						name: USER_PREFERENCES.SIDENAV_PINNED,
						description: USER_PREFERENCES.SIDENAV_PINNED,
						valueType: 'boolean',
						defaultValue: false,
						allowedValues: [],
						allowedScopes: ['user'],
						value: pinned,
					},
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
 * `sidenav_pinned` user preference.
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
