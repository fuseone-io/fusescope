import { useMemo } from 'react';
import { RowData } from 'components/CeleryOverview/CeleryOverviewTable/CeleryOverviewTable';
import SideSheet from 'components/PageTemplate/components/SideSheet';
import TagChip from 'components/PageTemplate/components/TagChip';
import { TagFilterItem } from 'types/api/queryBuilder/queryBuilderData';

import { getFiltersFromKeyValue } from '../CeleryOverviewUtils';
import OverviewRightPanelGraph from './OverviewRightPanelGraph';
import ValueInfo from './ValueInfo';

export default function CeleryOverviewDetails({
	details,
	onClose,
}: {
	details: RowData;
	onClose: () => void;
}): JSX.Element {
	const filters: TagFilterItem[] = useMemo(() => {
		const keyValues = Object.entries(details).map(([key, value]) => {
			switch (key) {
				case 'service_name':
					return getFiltersFromKeyValue('service.name', value, 'resource');
				case 'span_name':
					return getFiltersFromKeyValue('name', value, '');
				case 'messaging_system':
					return value === 'celery'
						? undefined
						: getFiltersFromKeyValue('messaging.system', value, 'tag');
				case 'destination':
					return getFiltersFromKeyValue(
						details.messaging_system === 'celery'
							? 'messaging.destination'
							: 'messaging.destination.name',
						value,
						'tag',
					);
				case 'kind_string':
					return getFiltersFromKeyValue('kind_string', value, '');
				default:
					return undefined;
			}
		});

		return keyValues.filter((item) => item !== undefined) as TagFilterItem[];
	}, [details]);

	return (
		<SideSheet
			open
			onClose={onClose}
			modal={false}
			width={600}
			testId="celery-overview-detail"
			title={<span className="tw:font-mono">{details.service_name}</span>}
			subtitle={
				<>
					<span className="tw:font-mono">{details.span_name}</span>
					<TagChip>{details.messaging_system}</TagChip>
					<span className="tw:font-mono">{details.destination}</span>
					<span>{details.kind_string}</span>
				</>
			}
			bodyClassName="tw:flex tw:flex-col tw:gap-4"
		>
			<ValueInfo filters={filters} />
			<OverviewRightPanelGraph filters={filters} />
		</SideSheet>
	);
}
