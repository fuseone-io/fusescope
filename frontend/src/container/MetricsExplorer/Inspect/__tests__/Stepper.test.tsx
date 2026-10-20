import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Stepper from '../Stepper';
import { InspectionStep } from '../types';

describe('Stepper', () => {
	const mockResetInspection = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('names the checklist without an emoji and shows progress', () => {
		render(
			<Stepper
				inspectionStep={InspectionStep.TIME_AGGREGATION}
				resetInspection={mockResetInspection}
			/>,
		);

		expect(screen.getByText('Metrics Inspector')).toBeInTheDocument();
		expect(screen.getByTestId('inspect-checklist-progress')).toHaveTextContent(
			'0 of 2',
		);
		expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
	});

	it('shows temporal aggregation step as active when on first step', () => {
		render(
			<Stepper
				inspectionStep={InspectionStep.TIME_AGGREGATION}
				resetInspection={mockResetInspection}
			/>,
		);

		const temporalStep = screen
			.getByText(/First, align the data by selecting a/)
			.closest('li');
		expect(temporalStep).toHaveAttribute('data-state', 'current');
	});

	it('shows temporal aggregation step as completed when on later steps', () => {
		render(
			<Stepper
				inspectionStep={InspectionStep.SPACE_AGGREGATION}
				resetInspection={mockResetInspection}
			/>,
		);

		const temporalStep = screen
			.getByText(/First, align the data by selecting a/)
			.closest('li');
		expect(temporalStep).toHaveAttribute('data-state', 'done');
		expect(screen.getByTestId('inspect-checklist-progress')).toHaveTextContent(
			'1 of 2',
		);
	});

	it('links the aggregations to the FuseScope docs', () => {
		render(
			<Stepper
				inspectionStep={InspectionStep.TIME_AGGREGATION}
				resetInspection={mockResetInspection}
			/>,
		);

		screen.getAllByRole('link').forEach((link) => {
			expect(link.getAttribute('href')).toMatch(
				/^https:\/\/fuseone-io\.github\.io\/fusescope-docs\//,
			);
		});
	});

	it('calls resetInspection when reset button is clicked', async () => {
		render(
			<Stepper
				inspectionStep={InspectionStep.COMPLETED}
				resetInspection={mockResetInspection}
			/>,
		);

		expect(screen.getByTestId('inspect-checklist-progress')).toHaveTextContent(
			'2 of 2',
		);
		await userEvent.click(screen.getByRole('button', { name: /Reset query/ }));

		expect(mockResetInspection).toHaveBeenCalledTimes(1);
	});
});
