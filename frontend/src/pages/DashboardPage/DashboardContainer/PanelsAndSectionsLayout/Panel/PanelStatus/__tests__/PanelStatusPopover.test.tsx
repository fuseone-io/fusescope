import { fireEvent, render, screen } from 'tests/test-utils';

import PanelStatusPopover from '../PanelStatusPopover';

const detail = {
	code: '',
	message: 'Encountered warnings',
	messages: ['Key `service.name` is ambiguous', 'Key `host.name` is ambiguous'],
};

// The status detail is a card with a scrolling list, drawn with the page
// theme's colors; in a tooltip, whose surface is inverted by design, it
// read light on light in the dark theme and dark on dark in the light one.
describe('PanelStatusPopover', () => {
	it('opens the detail in a popover on the page theme, not a tooltip', () => {
		render(<PanelStatusPopover variant="warning" detail={detail} />);
		expect(screen.queryByTestId('panel-status-content')).toBeNull();

		fireEvent.click(screen.getByTestId('panel-status-warning'));

		const content = screen.getByTestId('panel-status-content');
		expect(content.closest('[role="dialog"]')).not.toBeNull();
		expect(content.closest('[role="tooltip"]')).toBeNull();
		expect(screen.getByText('Key `host.name` is ambiguous')).toBeInTheDocument();
	});

	it('is a button, so the keyboard reaches it', () => {
		render(<PanelStatusPopover variant="error" detail={detail} />);
		const trigger = screen.getByTestId('panel-status-error');
		expect(trigger.tagName).toBe('BUTTON');
		expect(trigger).toHaveAccessibleName('Panel error');
	});
});
