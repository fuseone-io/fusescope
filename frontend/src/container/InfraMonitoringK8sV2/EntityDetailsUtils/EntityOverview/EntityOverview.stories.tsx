import type { Meta, StoryObj } from '@storybook/react-vite';
import { SheetTitle } from 'components/ui/sheet';
import { GlobalTimeProvider } from 'store/globalTime';

import type { PageStoryArgs } from '@/storybook/runtime/resolveStory';
import { storyMocks } from '@/storybook/controls/defineStoryMocks';

import {
	INFRA_MONITORING_K8S_PARAMS_KEYS,
	InfraMonitoringEntity,
} from '../../constants';
import EntityDetailSheet from '../../Base/components/EntityDetailSheet';
import EntityOverview, { EntityOverviewProps } from './EntityOverview';
import { overviewMocks } from './EntityOverview.stories.mocks';

const POD_UID = '63edbad0-398e-48e5-baba-f7ded7c73f1b';

/** The meta /api/v2/infra_monitoring/pods returns for one pod. */
const POD_ATTRIBUTES = {
	'k8s.pod.uid': POD_UID,
	'k8s.pod.name': 'app-demo-loadgenerator-579fbdd749-q5kgd',
	'k8s.namespace.name': 'generator',
	'k8s.cluster.name': 'mgmt',
	'k8s.node.name': 'gke-mgmt-pl-generator-e2st4-sp-41c1bdc8-p6z7',
	'k8s.deployment.name': 'app-demo-loadgenerator',
};

const route = `/infrastructure-monitoring/kubernetes?${INFRA_MONITORING_K8S_PARAMS_KEYS.CATEGORY}=pods&${INFRA_MONITORING_K8S_PARAMS_KEYS.SELECTED_ITEM}=${POD_UID}`;

type OverviewArgs = PageStoryArgs<typeof overviewMocks> & EntityOverviewProps;

const meta = {
	title: 'Infra monitoring/Drawer overview tab',
	component: EntityOverview,
	...storyMocks(overviewMocks, { route }),
	decorators: [
		(Story): JSX.Element => (
			<EntityDetailSheet
				open
				onOpenChange={(): void => undefined}
				header={
					<SheetTitle className="fs-ui tw:border-b tw:border-border tw:bg-surface-raised tw:px-4 tw:py-3 tw:font-mono tw:text-base tw:font-medium">
						app-demo-loadgenerator-579fbdd749-q5kgd
					</SheetTitle>
				}
			>
				<GlobalTimeProvider>
					<Story />
				</GlobalTimeProvider>
			</EntityDetailSheet>
		),
	],
} satisfies Meta<OverviewArgs>;

export default meta;

type Story = StoryObj<OverviewArgs>;

export const Default: Story = {
	args: {
		category: InfraMonitoringEntity.PODS,
		eventEntity: 'pod',
		attributes: POD_ATTRIBUTES,
		entity: { podUID: POD_UID },
		entityName: POD_ATTRIBUTES['k8s.pod.name'],
		queryKeyPrefix: 'pod',
	},
};
