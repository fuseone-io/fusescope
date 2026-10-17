import type { Meta, StoryObj } from '@storybook/react-vite';
import ROUTES from 'constants/routes';
import { expect, within } from 'storybook/test';
import type { SignozStoryParameters, StoryTheme } from '@/storybook/types';

function Page(): JSX.Element {
	return <div data-testid="page-content" />;
}

function shell(route: string, theme: StoryTheme): SignozStoryParameters {
	return { signoz: { layout: 'app', route, theme } };
}

/**
 * The top bar of every page with the sidebar: sidebar toggle, breadcrumb from
 * the route, the ⌘K search and, where the page has none, the global time picker.
 */
const meta = {
	title: 'Components/App Header',
	component: Page,
} satisfies Meta<typeof Page>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A service page: breadcrumb with the service name, global picker. */
export const ServiceLight: Story = {
	tags: ['play'],
	parameters: shell('/services/checkout-api', 'light'),
	play: async ({ canvasElement }): Promise<void> => {
		const header = within(
			await within(canvasElement.ownerDocument.body).findByTestId('app-header'),
		);

		await expect(header.getByText('checkout-api')).toBeVisible();
		await expect(header.getByTestId('app-header-search')).toBeVisible();
		await expect(header.getByTestId('app-header-time-controls')).toBeVisible();
	},
};

/** The same page in the dark theme. */
export const ServiceDark: Story = {
	parameters: shell('/services/checkout-api', 'dark'),
};

/** A page with its own picker: the header shows none. */
export const OwnPickerLight: Story = {
	parameters: shell(ROUTES.LOGS_PIPELINES, 'light'),
};

/** The same in the dark theme. */
export const OwnPickerDark: Story = {
	parameters: shell(ROUTES.LOGS_PIPELINES, 'dark'),
};
