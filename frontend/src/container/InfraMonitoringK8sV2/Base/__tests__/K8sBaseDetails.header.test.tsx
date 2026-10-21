import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { InfraMonitoringEvents } from 'constants/events';
import { render, screen } from 'tests/test-utils';

import {
	INFRA_MONITORING_K8S_PARAMS_KEYS,
	InfraMonitoringEntity,
	VIEW_TYPES,
} from '../../constants';
import K8sBaseDetails from '../K8sBaseDetails';
import { EntityStatus } from '../types';

jest.mock('container/TopNav/DateTimeSelectionV2/index.tsx', () => ({
	__esModule: true,
	default: (): JSX.Element => <div data-testid="mock-datetime" />,
}));

type TestEntity = { name: string; phase: string };

function renderDetails(
	getStatus?: (entity: TestEntity) => EntityStatus | null,
): void {
	render(
		<NuqsTestingAdapter
			searchParams={{
				[INFRA_MONITORING_K8S_PARAMS_KEYS.SELECTED_ITEM]: 'web-0',
				[INFRA_MONITORING_K8S_PARAMS_KEYS.VIEW]: VIEW_TYPES.METRICS,
			}}
		>
			<K8sBaseDetails<TestEntity>
				category={InfraMonitoringEntity.PODS}
				eventCategory={InfraMonitoringEvents.Pod}
				getSelectedItemExpression={(): string => "k8s.pod.name = 'web-0'"}
				fetchEntityData={jest
					.fn()
					.mockResolvedValue({ data: { name: 'web-0', phase: 'running' } })}
				getEntityName={(e): string => e.name}
				getInitialLogTracesExpression={(): string => ''}
				getInitialEventsExpression={(): string => ''}
				metadataConfig={[]}
				entityWidgetInfo={[]}
				getEntityQueryPayload={jest.fn().mockReturnValue([])}
				queryKeyPrefix="headerTest"
				getStatus={getStatus}
			/>
		</NuqsTestingAdapter>,
	);
}

describe('K8sBaseDetails header', () => {
	it.each([
		{ phase: 'running', label: 'Running', tone: 'success' as const },
		{ phase: 'failed', label: 'Failed', tone: 'error' as const },
	])('shows the $label status beside the name', async ({ label, tone }) => {
		renderDetails(() => ({ label, tone }));

		const badge = await screen.findByTestId('drawer-entity-status');
		expect(badge).toHaveTextContent(label);
		expect(badge).toHaveAttribute('data-tone', tone);
		expect(screen.getByTestId('drawer-entity-kind')).toHaveTextContent('Pod');
	});

	it('shows no status when the kind has none', async () => {
		renderDetails();

		await screen.findAllByText('web-0');
		expect(screen.queryByTestId('drawer-entity-status')).not.toBeInTheDocument();
	});
});
