import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, within } from 'storybook/test';

import PageTemplateFixture from './PageTemplateFixture';

/**
 * The parts new pages are built from: page column, header, query-synced tabs,
 * KPI strip, panels and the table helpers (sortable heads, status badges,
 * impact bars, pagination).
 */
const meta = {
	title: 'Components/Page Template',
	component: PageTemplateFixture,
} satisfies Meta<typeof PageTemplateFixture>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Light: Story = {
	tags: ['play'],
	parameters: { signoz: { theme: 'light' } },
	play: async ({ canvasElement }): Promise<void> => {
		const canvas = within(canvasElement);

		await expect(
			canvas.getByRole('heading', { level: 1, name: 'checkout-api' }),
		).toBeVisible();
		await expect(
			canvas.getByRole('region', { name: 'Service metrics' }),
		).toBeVisible();

		// Radix tabs activate on mousedown.
		fireEvent.mouseDown(canvas.getByRole('tab', { name: /DB Call Metrics/ }));
		await expect(
			canvas.getByRole('heading', { name: 'Database calls' }),
		).toBeVisible();
	},
};

export const Dark: Story = {
	parameters: { signoz: { theme: 'dark' } },
};
