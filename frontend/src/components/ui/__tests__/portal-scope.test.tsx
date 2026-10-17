import { render, screen } from '@testing-library/react';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from 'components/ui/hover-card';
import { Sheet, SheetContent, SheetTitle } from 'components/ui/sheet';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from 'components/ui/tooltip';

// Portalled content renders under <body>, outside any `.fs-ui` ancestor, so it
// must carry the scope class itself to get the reset.
describe('portalled content', () => {
	it('scopes the dropdown menu', () => {
		render(
			<DropdownMenu open>
				<DropdownMenuTrigger>open</DropdownMenuTrigger>
				<DropdownMenuContent data-testid="menu">
					<DropdownMenuItem>item</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId('menu')).toHaveClass('fs-ui');
	});

	it('scopes the tooltip', () => {
		render(
			<TooltipProvider>
				<Tooltip open>
					<TooltipTrigger>hover</TooltipTrigger>
					<TooltipContent data-testid="tooltip">tip</TooltipContent>
				</Tooltip>
			</TooltipProvider>,
		);

		expect(screen.getByTestId('tooltip')).toHaveClass('fs-ui');
	});

	it('scopes the hover card', () => {
		render(
			<HoverCard open>
				<HoverCardTrigger>hover</HoverCardTrigger>
				<HoverCardContent data-testid="hover-card">card</HoverCardContent>
			</HoverCard>,
		);

		expect(screen.getByTestId('hover-card')).toHaveClass('fs-ui');
	});

	it('scopes the sheet and its overlay', () => {
		render(
			<Sheet open>
				<SheetContent data-testid="sheet" aria-describedby={undefined}>
					<SheetTitle>title</SheetTitle>
				</SheetContent>
			</Sheet>,
		);

		expect(screen.getByTestId('sheet')).toHaveClass('fs-ui');
		expect(document.querySelector('[data-slot="sheet-overlay"]')).toHaveClass(
			'fs-ui',
		);
	});
});
