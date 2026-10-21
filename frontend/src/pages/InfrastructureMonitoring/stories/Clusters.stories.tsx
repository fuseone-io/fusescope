import type { Meta, StoryObj } from '@storybook/react-vite';

import { storyMocks } from '@/storybook/controls/defineStoryMocks';
import type { PageStoryArgs } from '@/storybook/runtime/resolveStory';

import { clustersMocks } from './Kubernetes.stories.mocks';

import InfrastructureMonitoringPage from '../InfrastructureMonitoringPage';

type ClustersArgs = PageStoryArgs<typeof clustersMocks>;

const pageStory = storyMocks(clustersMocks, { layout: 'app' });

/**
 * The Kubernetes clusters tab: CPU, memory and pod counts per cluster, each row
 * opening the drawer.
 *
 * Route: `/infrastructure-monitoring/kubernetes?category=clusters`.
 */
const meta = {
	title: 'Pages/Infrastructure/Kubernetes/Clusters',
	component: InfrastructureMonitoringPage,
	...pageStory,
	parameters: { ...pageStory.parameters },
} satisfies Meta<ClustersArgs>;

export default meta;

/**
 * Clusters with their node readiness and pod status counts, and CPU and memory
 * against the cluster's allocatable capacity. The drawer carries the counts cards
 * that jump to the nodes and pods of the cluster.
 */
export const Default: StoryObj<ClustersArgs> = {};

/**
 * The cluster's details sheet with the Tooltips control on: the counts strip
 * (namespaces, nodes and workloads, each linking to its list) and the metrics
 * charts with their series in the panel header. The counts strip is on the
 * clusters and namespaces sheets only, so this is where it is reviewable.
 */
export const Tooltips: StoryObj<ClustersArgs> = {
	args: { tooltipsOpen: true, drawer: true },
};
