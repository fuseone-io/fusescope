import { createRef, ReactElement, RefObject } from 'react';
import { render } from '@testing-library/react';
import { Avatar } from 'components/ui/avatar';
import { Badge } from 'components/ui/badge';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Sheet, SheetOverlay, SheetPortal } from 'components/ui/sheet';
import {
	SidebarGroupAction,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuSubButton,
	SidebarProvider,
	SidebarTrigger,
} from 'components/ui/sidebar';

import { mockMatchMedia } from './mockMatchMedia';

// React 18 drops `ref` on plain function components, so anything Radix may
// render through `asChild` (or Presence) must forward it explicitly.
type Case = {
	name: string;
	element: (ref: RefObject<HTMLElement>) => ReactElement;
	tag: string;
};

const cases: Case[] = [
	{
		name: 'Button',
		element: (ref) => <Button ref={ref as RefObject<HTMLButtonElement>} />,
		tag: 'BUTTON',
	},
	{
		name: 'Input',
		element: (ref) => <Input ref={ref as RefObject<HTMLInputElement>} />,
		tag: 'INPUT',
	},
	{ name: 'Badge', element: (ref) => <Badge ref={ref} />, tag: 'SPAN' },
	{
		name: 'Avatar',
		element: (ref) => <Avatar ref={ref as RefObject<HTMLSpanElement>} />,
		tag: 'SPAN',
	},
	{
		name: 'SheetOverlay',
		element: (ref) => (
			<Sheet open>
				<SheetPortal>
					<SheetOverlay ref={ref as RefObject<HTMLDivElement>} />
				</SheetPortal>
			</Sheet>
		),
		tag: 'DIV',
	},
	{
		name: 'SidebarTrigger',
		element: (ref) => (
			<SidebarProvider>
				<SidebarTrigger ref={ref as RefObject<HTMLButtonElement>} />
			</SidebarProvider>
		),
		tag: 'BUTTON',
	},
	{
		name: 'SidebarMenuButton',
		element: (ref) => (
			<SidebarProvider>
				<SidebarMenuButton ref={ref as RefObject<HTMLButtonElement>} />
			</SidebarProvider>
		),
		tag: 'BUTTON',
	},
	{
		name: 'SidebarMenuAction',
		element: (ref) => (
			<SidebarMenuAction ref={ref as RefObject<HTMLButtonElement>} />
		),
		tag: 'BUTTON',
	},
	{
		name: 'SidebarMenuSubButton',
		element: (ref) => (
			<SidebarMenuSubButton ref={ref as RefObject<HTMLAnchorElement>} />
		),
		tag: 'A',
	},
	{
		name: 'SidebarGroupAction',
		element: (ref) => (
			<SidebarGroupAction ref={ref as RefObject<HTMLButtonElement>} />
		),
		tag: 'BUTTON',
	},
];

describe('ref forwarding', () => {
	beforeEach(() => {
		mockMatchMedia();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it.each(cases)(
		'$name forwards its ref to the DOM node',
		({ element, tag }) => {
			const ref = createRef<HTMLElement>();
			render(element(ref));

			expect(ref.current?.tagName).toBe(tag);
		},
	);
});
