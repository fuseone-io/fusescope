import { render, screen } from '@testing-library/react';

import type { VariableImpactMode } from '../../utils/variableUsages';
import VariableImpactDialog from '../VariableImpactDialog';

describe('VariableImpactDialog intro', () => {
	it.each<{ mode: VariableImpactMode; expected: string }>([
		{
			mode: 'apply',
			expected:
				'Applying $env can update up to 0 panel queries. Review the changes before applying.',
		},
		{
			mode: 'delete',
			expected:
				'$env is used in 0 places. Edit or remove each usage before deleting.',
		},
	])('$mode', ({ mode, expected }) => {
		render(
			<VariableImpactDialog
				open
				mode={mode}
				variableName="env"
				usages={[]}
				isLoading={false}
				onConfirm={jest.fn()}
				onClose={jest.fn()}
			/>,
		);

		expect(screen.getByText(expected)).toBeInTheDocument();
	});
});
