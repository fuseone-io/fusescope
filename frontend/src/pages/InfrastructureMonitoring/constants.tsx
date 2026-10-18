import { TabRoutes } from 'components/RouteTab/types';
import ROUTES from 'constants/routes';
import InfraMonitoringHostsV2 from 'container/InfraMonitoringHostsV2';
import InfraMonitoringK8sV2 from 'container/InfraMonitoringK8sV2';
import {
	DEFAULT_K8S_CATEGORY,
	INFRA_MONITORING_K8S_PARAMS_KEYS,
} from 'container/InfraMonitoringK8sV2/constants';

export const Hosts: TabRoutes = {
	Component: InfraMonitoringHostsV2,
	name: 'Hosts',
	route: ROUTES.INFRASTRUCTURE_MONITORING_HOSTS,
	key: ROUTES.INFRASTRUCTURE_MONITORING_HOSTS,
};

export const Kubernetes: TabRoutes = {
	Component: InfraMonitoringK8sV2,
	name: 'Kubernetes',
	route: `${ROUTES.INFRASTRUCTURE_MONITORING_KUBERNETES}?${INFRA_MONITORING_K8S_PARAMS_KEYS.CATEGORY}=${DEFAULT_K8S_CATEGORY}`,
	key: ROUTES.INFRASTRUCTURE_MONITORING_KUBERNETES,
};
