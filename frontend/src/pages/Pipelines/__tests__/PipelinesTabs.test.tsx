import { fireEvent, render, screen } from 'tests/test-utils';

import Pipelines from '..';

jest.mock('api/pipeline/get', () => ({
	__esModule: true,
	default: jest.fn().mockResolvedValue({
		statusCode: 200,
		payload: { version: 3, pipelines: [], history: [] },
	}),
}));

jest.mock(
	'container/PipelinePage/Layouts/Pipeline',
	() =>
		function PipelinePage(): JSX.Element {
			return <div>pipelines content</div>;
		},
);

jest.mock(
	'container/PipelinePage/Layouts/ChangeHistory',
	() =>
		function ChangeHistory(): JSX.Element {
			return <div>history content</div>;
		},
);

describe('Pipelines sections', () => {
	it('switches to the change history and keeps the pipelines mounted', async () => {
		render(<Pipelines />);

		const pipelinesTab = await screen.findByRole('tab', { name: /Pipelines/ });
		expect(pipelinesTab).toHaveAttribute('aria-selected', 'true');
		expect(screen.getByText('pipelines content')).toBeVisible();

		fireEvent.click(screen.getByRole('tab', { name: /Change history/ }));

		expect(screen.getByRole('tab', { name: /Change history/ })).toHaveAttribute(
			'aria-selected',
			'true',
		);
		expect(screen.getByText('history content')).toBeVisible();
		// Unsaved edits in the pipelines section survive a look at the history.
		expect(screen.getByText('pipelines content')).not.toBeVisible();
	});
});
