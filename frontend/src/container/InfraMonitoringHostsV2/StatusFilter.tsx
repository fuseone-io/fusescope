import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import { InfraMonitoringEntity } from 'container/InfraMonitoringK8sV2/constants';
import {
	StatusFilterValue,
	useInfraMonitoringPageListing,
	useInfraMonitoringStatusFilter,
} from 'container/InfraMonitoringK8sV2/hooks';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';

import { logInfraFilterCustomizedEvent } from 'container/InfraMonitoringK8sV2/Base/events';

const statusOptions: Array<{
	label: string;
	value: StatusFilterValue | 'all';
}> = [
	{ label: 'All', value: 'all' },
	{ label: 'Active', value: 'active' },
	{ label: 'Inactive', value: 'inactive' },
];

function StatusFilter(): JSX.Element {
	const [statusFilter, setStatusFilter] = useInfraMonitoringStatusFilter();
	const [, setCurrentPage] = useInfraMonitoringPageListing();
	const { currentQuery } = useQueryBuilder();

	const handleChange = (value: StatusFilterValue | 'all'): void => {
		if (value !== undefined) {
			void setStatusFilter(value === 'all' ? '' : value);
			void setCurrentPage(1);

			const expression =
				currentQuery.builder.queryData[0]?.filter?.expression || '';
			logInfraFilterCustomizedEvent(
				InfraMonitoringEntity.HOSTS,
				'host_status_toggle',
				expression,
				value === 'all' ? [] : ['host_status'],
			);
		}
	};

	return (
		<div className="fs-ui tw:flex tw:items-center tw:gap-2 tw:font-sans">
			<span className="tw:text-[13px] tw:text-muted-foreground">Status</span>
			<SegmentedControl<StatusFilterValue | 'all'>
				label="Host status"
				size="sm"
				options={statusOptions}
				value={
					statusFilter === 'active' || statusFilter === 'inactive'
						? statusFilter
						: 'all'
				}
				onChange={handleChange}
			/>
		</div>
	);
}

export default StatusFilter;
