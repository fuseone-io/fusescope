import type { ComponentProps } from 'react';
import {
	ArrowRight,
	Box,
	CirclePlus,
	ClipboardList,
	Container,
	Database,
	Hexagon,
	LayoutGrid,
	Rows3,
	Server,
} from 'lucide-react';

import { InfraMonitoringEntity } from '../constants';

/**
 * One icon per category, so the section tabs and the drawer that opens from
 * them show a resource the same way.
 */
type IconSize = ComponentProps<typeof Container>['size'];

const CATEGORY_ICONS: Record<InfraMonitoringEntity, typeof Container> = {
	[InfraMonitoringEntity.HOSTS]: Server,
	[InfraMonitoringEntity.PODS]: Box,
	[InfraMonitoringEntity.CONTAINERS]: Container,
	[InfraMonitoringEntity.NODES]: Server,
	[InfraMonitoringEntity.NAMESPACES]: LayoutGrid,
	[InfraMonitoringEntity.CLUSTERS]: Hexagon,
	[InfraMonitoringEntity.DEPLOYMENTS]: ArrowRight,
	[InfraMonitoringEntity.STATEFULSETS]: Rows3,
	[InfraMonitoringEntity.DAEMONSETS]: CirclePlus,
	[InfraMonitoringEntity.JOBS]: ClipboardList,
	[InfraMonitoringEntity.VOLUMES]: Database,
};

export function CategoryIcon({
	category,
	size = 14,
}: {
	category: InfraMonitoringEntity;
	size?: IconSize;
}): JSX.Element {
	const Icon = CATEGORY_ICONS[category];

	return <Icon size={size} />;
}
