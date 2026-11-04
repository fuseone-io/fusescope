import { TabRoutes } from 'components/RouteTab/types';
import ROUTES from 'constants/routes';
import CollectorHealth from 'container/CollectorHealth';
import InfraMonitoringHostsV2 from 'container/InfraMonitoringHostsV2';
import InfraMonitoringK8sV2 from 'container/InfraMonitoringK8sV2';
import {
	DEFAULT_K8S_CATEGORY,
	INFRA_MONITORING_K8S_PARAMS_KEYS,
} from 'container/InfraMonitoringK8sV2/constants';
import { Cable, Server, ShipWheel } from 'lucide-react';

export const Hosts: TabRoutes = {
	Component: InfraMonitoringHostsV2,
	name: 'Hosts',
	icon: <Server />,
	route: ROUTES.INFRASTRUCTURE_MONITORING_HOSTS,
	key: ROUTES.INFRASTRUCTURE_MONITORING_HOSTS,
};

export const Kubernetes: TabRoutes = {
	Component: InfraMonitoringK8sV2,
	name: 'Kubernetes',
	icon: <ShipWheel />,
	route: `${ROUTES.INFRASTRUCTURE_MONITORING_KUBERNETES}?${INFRA_MONITORING_K8S_PARAMS_KEYS.CATEGORY}=${DEFAULT_K8S_CATEGORY}`,
	key: ROUTES.INFRASTRUCTURE_MONITORING_KUBERNETES,
};

export const Collectors: TabRoutes = {
	Component: CollectorHealth,
	name: 'Collectors',
	icon: <Cable />,
	route: ROUTES.INFRASTRUCTURE_MONITORING_COLLECTORS,
	key: ROUTES.INFRASTRUCTURE_MONITORING_COLLECTORS,
};
