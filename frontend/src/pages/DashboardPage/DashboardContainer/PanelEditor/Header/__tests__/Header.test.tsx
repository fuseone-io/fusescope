import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, userEvent } from 'tests/test-utils';
import { useIsAIAssistantEnabled } from 'hooks/useIsAIAssistantEnabled';

import Header from '../Header';

jest.mock('hooks/useIsAIAssistantEnabled', () => ({
	useIsAIAssistantEnabled: jest.fn(),
}));

jest.mock('hooks/useGetTenantLicense', () => ({
	useGetTenantLicense: (): unknown => ({
		isCloudUser: true,
		isEnterpriseSelfHostedUser: false,
	}),
}));

jest.mock('api/common/logEvent', () => ({
	__esModule: true,
	default: jest.fn(),
}));

const mockUseIsAIAssistantEnabled = useIsAIAssistantEnabled as jest.Mock;

function renderHeader(
	props: Partial<ComponentProps<typeof Header>> = {},
): void {
	render(
		<MemoryRouter>
			<Header
				isDirty={false}
				isSaving={false}
				onSave={jest.fn()}
				onClose={jest.fn()}
				{...props}
			/>
		</MemoryRouter>,
	);
}

describe('PanelEditor Header', () => {
	afterEach(() => {
		mockUseIsAIAssistantEnabled.mockReset();
	});

	// The editor is a full page, so the side nav's Noz entry point is gone while it is
	// open — the header has to offer it instead.
	it('offers Noz alongside the editor actions', () => {
		mockUseIsAIAssistantEnabled.mockReturnValue(true);

		renderHeader();

		expect(screen.getByRole('button', { name: 'Open Noz' })).toBeInTheDocument();
		expect(screen.getByTestId('panel-editor-v2-save')).toBeInTheDocument();
		expect(screen.getByTestId('panel-editor-v2-close')).toBeInTheDocument();
	});

	it('omits Noz when the AI assistant is disabled', () => {
		mockUseIsAIAssistantEnabled.mockReturnValue(false);

		renderHeader();

		expect(
			screen.queryByRole('button', { name: 'Open Noz' }),
		).not.toBeInTheDocument();
		expect(screen.getByTestId('panel-editor-v2-save')).toBeInTheDocument();
	});

	it('keeps Save enabled even when there are no unsaved edits', () => {
		mockUseIsAIAssistantEnabled.mockReturnValue(false);

		renderHeader({ isDirty: false });

		expect(screen.getByTestId('panel-editor-v2-save')).not.toHaveAttribute(
			'aria-disabled',
			'true',
		);
	});

	it('disables Save only while read-only or saving', () => {
		mockUseIsAIAssistantEnabled.mockReturnValue(false);

		renderHeader({
			isDirty: true,
			readOnly: true,
			readOnlyTooltip: 'Locked',
		});

		expect(screen.getByTestId('panel-editor-v2-save')).toHaveAttribute(
			'aria-disabled',
			'true',
		);
	});

	it('shows the Unsaved Changes badge only when there are unsaved edits', () => {
		mockUseIsAIAssistantEnabled.mockReturnValue(false);

		renderHeader({ isDirty: false });
		expect(
			screen.queryByTestId('panel-editor-v2-unsaved-badge'),
		).not.toBeInTheDocument();

		renderHeader({ isDirty: true });
		expect(
			screen.getByTestId('panel-editor-v2-unsaved-badge'),
		).toBeInTheDocument();
	});

	it('shows where the panel lives and the time picker it is given', () => {
		mockUseIsAIAssistantEnabled.mockReturnValue(false);

		renderHeader({
			crumbs: {
				dashboard: 'HotROD service health',
				section: 'Golden signals',
				panel: 'Request rate by service',
			},
			timePicker: <span>Last 30 minutes</span>,
		});

		const crumbs = screen.getByTestId('panel-editor-breadcrumb');
		expect(crumbs).toHaveTextContent(
			'HotROD service health›Golden signals›Request rate by service',
		);
		expect(screen.getByText('Request rate by service')).toHaveAttribute(
			'aria-current',
			'page',
		);
		expect(screen.getByTestId('panel-editor-time-picker')).toHaveTextContent(
			'Last 30 minutes',
		);
	});

	it('opens the same discard confirmation from Discard as from Close', async () => {
		mockUseIsAIAssistantEnabled.mockReturnValue(false);
		const user = userEvent.setup();
		const onClose = jest.fn();

		renderHeader({ isDirty: true, onClose });
		await user.click(screen.getByTestId('panel-editor-v2-discard'));

		await expect(
			screen.findByTestId('panel-editor-v2-discard-modal'),
		).resolves.toBeInTheDocument();
		expect(onClose).not.toHaveBeenCalled();

		await user.click(screen.getByTestId('panel-editor-v2-discard-confirm'));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('disables Discard while there is nothing to discard', () => {
		mockUseIsAIAssistantEnabled.mockReturnValue(false);

		renderHeader({ isDirty: false });

		expect(screen.getByTestId('panel-editor-v2-discard')).toHaveAttribute(
			'aria-disabled',
			'true',
		);
	});
});
