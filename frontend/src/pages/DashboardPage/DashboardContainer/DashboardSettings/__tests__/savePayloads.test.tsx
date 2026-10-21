import type { DashboardtypesGettableDashboardV2DTO } from 'api/generated/services/fuseScope.schemas';
import { fireEvent, render, screen, waitFor } from 'tests/test-utils';

import { useDashboardStore } from '../../store/useDashboardStore';
import Overview from '../Overview';
import VariablesSettings from '../Variables';

const patchAsync = jest.fn();

jest.mock('../../hooks/useOptimisticPatch', () => ({
	useOptimisticPatch: (): {
		patchAsync: typeof patchAsync;
		isPatching: boolean;
		error: null;
	} => ({ patchAsync, isPatching: false, error: null }),
}));

jest.mock('../../hooks/useDashboardEditContext', () => ({
	useDashboardEditContext: (): {
		isEditable: boolean;
		editChecks: never[];
		editDisabledTooltip: undefined;
	} => ({ isEditable: true, editChecks: [], editDisabledTooltip: undefined }),
}));

const environment = {
	kind: 'ListVariable',
	spec: {
		display: { name: 'environment', description: 'Deployment environment' },
		defaultValue: 'production',
		allowAllValue: false,
		allowMultiple: false,
		customAllValue: '',
		capturingRegexp: '',
		sort: 'none',
		plugin: {
			kind: 'signoz/CustomVariable',
			spec: { customValue: 'production,staging,development' },
		},
		name: 'environment',
	},
};

const owner = {
	kind: 'TextVariable',
	spec: {
		display: { name: 'owner', description: '' },
		value: 'platform-team',
		constant: false,
		name: 'owner',
	},
};

const service = {
	kind: 'ListVariable',
	spec: {
		display: { name: 'service', description: '' },
		allowAllValue: true,
		allowMultiple: true,
		customAllValue: '',
		capturingRegexp: '',
		sort: 'none',
		plugin: {
			kind: 'signoz/DynamicVariable',
			spec: { name: 'service.name', signal: 'traces' },
		},
		name: 'service',
	},
};

const dashboard = {
	id: 'dash-1',
	updatedAt: '2026-10-20T16:53:10.472673Z',
	image: '/assets/Icons/line-chart',
	tags: [{ key: 'team', value: 'demo' }],
	spec: {
		display: { name: 'HotROD service health', description: '' },
		panels: {},
		layouts: [],
		variables: [environment, owner, service],
	},
} as unknown as DashboardtypesGettableDashboardV2DTO;

describe('dashboard settings save payloads', () => {
	beforeEach(() => {
		patchAsync.mockReset();
		patchAsync.mockResolvedValue({});
		useDashboardStore.setState({ dashboardId: 'dash-1' });
	});

	it('saves the Overview edits as the same JSON patch', async () => {
		render(<Overview dashboard={dashboard} />);

		fireEvent.change(screen.getByTestId('dashboard-name'), {
			target: { value: 'HotROD health' },
		});
		fireEvent.change(screen.getByTestId('dashboard-desc'), {
			target: { value: 'Golden signals' },
		});
		const tagInput = screen.getByPlaceholderText('key:value');
		fireEvent.change(tagInput, { target: { value: 'env:prod' } });
		fireEvent.keyDown(tagInput, { key: 'Enter' });

		fireEvent.click(await screen.findByTestId('save-dashboard-config'));

		await waitFor(() => expect(patchAsync).toHaveBeenCalledTimes(1));
		expect(patchAsync).toHaveBeenCalledWith([
			{ op: 'replace', path: '/spec/display/name', value: 'HotROD health' },
			{ op: 'add', path: '/spec/display/description', value: 'Golden signals' },
			{
				op: 'replace',
				path: '/tags',
				value: [
					{ key: 'team', value: 'demo' },
					{ key: 'env', value: 'prod' },
				],
			},
		]);
	});

	it('saves an edited variable as the same JSON patch', async () => {
		render(<VariablesSettings dashboard={dashboard} />);

		fireEvent.click(await screen.findByTestId('variable-edit-environment'));
		fireEvent.click(await screen.findByTestId('variable-multi-switch'));
		fireEvent.click(screen.getByTestId('variable-save'));

		await waitFor(() => expect(patchAsync).toHaveBeenCalledTimes(1));
		expect(patchAsync.mock.calls[0][0]).toStrictEqual([
			{
				op: 'add',
				path: '/spec/variables',
				value: [
					{
						kind: 'ListVariable',
						spec: {
							display: { name: 'environment', description: 'Deployment environment' },
							defaultValue: 'production',
							allowAllValue: false,
							allowMultiple: true,
							sort: 'none',
							plugin: {
								kind: 'signoz/CustomVariable',
								spec: { customValue: 'production,staging,development' },
							},
							name: 'environment',
						},
					},
					owner,
					{
						kind: 'ListVariable',
						spec: {
							display: { name: 'service', description: '' },
							defaultValue: undefined,
							allowAllValue: true,
							allowMultiple: true,
							sort: 'none',
							plugin: {
								kind: 'signoz/DynamicVariable',
								spec: { name: 'service.name', signal: 'traces' },
							},
							name: 'service',
						},
					},
				],
			},
		]);
	});
});
