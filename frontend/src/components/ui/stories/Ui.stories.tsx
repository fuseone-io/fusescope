import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import ComponentsFixture from './ComponentsFixture';
import SidebarFixture from './SidebarFixture';

const meta = {
	title: 'Components/UI',
	component: ComponentsFixture,
} satisfies Meta<typeof ComponentsFixture>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Light: Story = {
	parameters: { signoz: { theme: 'light' } },
};

export const Dark: Story = {
	parameters: { signoz: { theme: 'dark' } },
};

function sidebarState(canvasElement: HTMLElement): string | null {
	return (
		canvasElement
			.querySelector('[data-slot="sidebar"]')
			?.getAttribute('data-state') ?? null
	);
}

export const SidebarShell: Story = {
	tags: ['play'],
	render: () => <SidebarFixture />,
	play: async ({ canvasElement }): Promise<void> => {
		const canvas = within(canvasElement);

		await expect(sidebarState(canvasElement)).toBe('expanded');

		await userEvent.click(canvas.getByTestId('sidebar-trigger'));
		await expect(sidebarState(canvasElement)).toBe('collapsed');

		await userEvent.keyboard('{Control>}b{/Control}');
		await expect(sidebarState(canvasElement)).toBe('expanded');
	},
};
