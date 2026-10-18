import { ComponentProps } from 'react';
import { useSidebar } from 'components/ui/sidebar';
import { TooltipContent } from 'components/ui/tooltip';

/** Footer icon buttons have no visible label, so their tooltip always shows. */
export function useFooterTooltip(
	label: string,
): ComponentProps<typeof TooltipContent> {
	const { state, isMobile } = useSidebar();

	return {
		children: label,
		hidden: false,
		side: state === 'collapsed' && !isMobile ? 'right' : 'top',
	};
}
