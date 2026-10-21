/** Resource keys `/dependency_graph` filters on: the columns of its table. */
export const serviceMapGraphKeys = [
	'resource_deployment_environment',
	'resource_deployment.environment',
	'resource_k8s_cluster_name',
	'resource_k8s.cluster.name',
	'resource_k8s_namespace_name',
	'resource_k8s.namespace.name',
];

/** Keys the service map offers; the ones the graph ignores are applied to its services. */
export const whilelistedKeys = [
	...serviceMapGraphKeys,
	'resource_k8s_cluster_namespace',
	'resource_k8s.cluster.namespace',
	'resource_service_namespace',
	'resource_service.namespace',
];
