import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from 'components/ui/button';
import { Compass, Lock, TriangleAlert } from 'lucide-react';
import { expect, within } from 'storybook/test';

import SystemPagePanel from '../SystemPagePanel';

/**
 * The centred card system screens are built on: not found, unauthorized, error
 * fallback, locked workspaces, version status.
 */
const meta = {
	title: 'Components/System Page Panel',
	component: SystemPagePanel,
	args: {
		icon: <Lock />,
		tone: 'warning',
		eyebrow: 'Trial Plan Expired',
		title: 'Upgrade to Continue',
		description:
			'Upgrade now to keep enjoying all the great features you’ve been using.',
		actions: (
			<>
				<Button>Continue my Journey</Button>
				<Button
					variant="outline"
					className="tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!"
				>
					Need More Time?
				</Button>
			</>
		),
		footer: (
			<Button variant="link" size="sm">
				Contact Us
			</Button>
		),
	},
	decorators: [
		(Story): JSX.Element => (
			<div className="tw:h-[640px]">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof SystemPagePanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Light: Story = {
	tags: ['play'],
	parameters: { signoz: { theme: 'light' } },
	play: async ({ canvasElement }): Promise<void> => {
		const canvas = within(canvasElement);

		await expect(
			canvas.getByRole('region', { name: 'Upgrade to Continue' }),
		).toBeVisible();
		await expect(
			canvas.getByRole('button', { name: 'Continue my Journey' }),
		).toBeVisible();
	},
};

export const Dark: Story = {
	parameters: { signoz: { theme: 'dark' } },
};

export const ErrorTone: Story = {
	parameters: { signoz: { theme: 'dark' } },
	args: {
		icon: <TriangleAlert />,
		tone: 'error',
		eyebrow: undefined,
		title: 'Something went wrong :/',
		footer: undefined,
	},
};

export const NeutralTone: Story = {
	parameters: { signoz: { theme: 'light' } },
	args: {
		icon: <Compass />,
		tone: 'neutral',
		eyebrow: undefined,
		title: 'Page Not Found',
		description: 'Ah, seems like we reached a dead end!',
		actions: <Button>Return Home</Button>,
		footer: undefined,
	},
};

export const Loading: Story = {
	parameters: { signoz: { theme: 'dark' } },
	args: { loading: true },
};
