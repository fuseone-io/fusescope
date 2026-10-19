import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
} from 'components/ui/dialog';

describe('Dialog', () => {
	it('scopes the content and its overlay', () => {
		render(
			<Dialog open>
				<DialogContent data-testid="dialog" aria-describedby={undefined}>
					<DialogTitle>title</DialogTitle>
				</DialogContent>
			</Dialog>,
		);

		expect(screen.getByTestId('dialog')).toHaveClass('fs-ui');
		expect(document.querySelector('[data-slot="dialog-overlay"]')).toHaveClass(
			'fs-ui',
		);
	});

	it('forwards refs to the overlay and the content', () => {
		const overlay = createRef<HTMLDivElement>();
		const content = createRef<HTMLDivElement>();
		render(
			<Dialog open>
				<DialogPortal>
					<DialogOverlay ref={overlay} />
				</DialogPortal>
				<DialogContent ref={content} aria-describedby={undefined}>
					<DialogTitle>title</DialogTitle>
				</DialogContent>
			</Dialog>,
		);

		expect(overlay.current?.tagName).toBe('DIV');
		expect(content.current?.getAttribute('role')).toBe('dialog');
	});

	it('closes from its close button unless it is hidden', async () => {
		const onOpenChange = jest.fn();
		const { rerender } = render(
			<Dialog open onOpenChange={onOpenChange}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>title</DialogTitle>
						<DialogDescription>body</DialogDescription>
					</DialogHeader>
					<DialogFooter>footer</DialogFooter>
				</DialogContent>
			</Dialog>,
		);

		await userEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(onOpenChange).toHaveBeenCalledWith(false);

		rerender(
			<Dialog open onOpenChange={onOpenChange}>
				<DialogContent showCloseButton={false}>
					<DialogTitle>title</DialogTitle>
					<DialogDescription>body</DialogDescription>
				</DialogContent>
			</Dialog>,
		);
		expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
	});
});
