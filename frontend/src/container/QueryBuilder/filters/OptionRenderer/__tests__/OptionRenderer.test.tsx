import { render, screen } from '@testing-library/react';

import OptionRenderer from '../OptionRenderer';

describe('OptionRenderer', () => {
	it('shows the key first, then its type and data type as bare values', () => {
		const { container } = render(
			<OptionRenderer
				label="k8s.deployment.name"
				value="k8s.deployment.name"
				type="resource"
				dataType="string"
			/>,
		);

		const row = container.querySelector('.selectOptionContainer');
		expect(row?.firstElementChild).toHaveTextContent('k8s.deployment.name');
		expect(row?.firstElementChild).toHaveClass('option-value');
		expect(screen.getByText('resource')).toHaveAttribute(
			'title',
			'Type: resource',
		);
		expect(screen.getByText('string')).toHaveAttribute(
			'title',
			'Data type: string',
		);
		expect(screen.queryByText(/Type:/)).not.toBeInTheDocument();
	});

	it('leaves out an unknown data type', () => {
		const { container } = render(
			<OptionRenderer label="host" value="host" type="tag" dataType="" />,
		);

		expect(container.querySelectorAll('.option-badge')).toHaveLength(1);
	});

	it('renders a plain label when the key has no type', () => {
		render(<OptionRenderer label="custom" value="custom" type="" dataType="" />);

		expect(screen.getByText('custom')).toBeInTheDocument();
	});
});
