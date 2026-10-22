import { fireEvent, render, screen } from '@testing-library/react';

import SegmentedControl from '../components/SegmentedControl';

describe('SegmentedControl', () => {
	it('disables a single option and shows its badge', () => {
		const onChange = jest.fn();
		render(
			<SegmentedControl
				label="Platform"
				value="web"
				onChange={onChange}
				options={[
					{ value: 'web', label: 'Web' },
					{
						value: 'ios',
						label: 'iOS',
						disabled: true,
						title: 'Coming soon',
						badge: <span>Soon</span>,
					},
				]}
			/>,
		);

		const ios = screen.getByRole('button', { name: /iOS/ });
		expect(ios).toBeDisabled();
		expect(ios).toHaveTextContent('Soon');
		expect(ios).toHaveAttribute('title', 'Coming soon');
		fireEvent.click(ios);
		expect(onChange).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: 'Web' })).toBeEnabled();
	});
});
