import { useState } from 'react';
import CeleryOverviewConfigOptions from 'components/CeleryOverview/CeleryOverviewConfigOptions/CeleryOverviewConfigOptions';
import CeleryOverviewTable, {
	RowData,
} from 'components/CeleryOverview/CeleryOverviewTable/CeleryOverviewTable';
import { Input } from 'components/ui/input';
import { Search } from 'lucide-react';

import CeleryOverviewDetails from './CeleryOverviewDetail/CeleryOverviewDetails';

const SEARCH_PLACEHOLDER = 'Search across all columns';

export default function CeleryOverview(): JSX.Element {
	const [details, setDetails] = useState<RowData | null>(null);
	const [searchText, setSearchText] = useState('');

	return (
		<div className="tw:flex tw:flex-col tw:gap-4" data-testid="mq-overview">
			<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
				<div className="fs-ui tw:relative tw:w-full tw:font-sans tw:sm:w-72">
					<Search
						aria-hidden="true"
						className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-3 tw:size-4 tw:-translate-y-1/2 tw:text-subtle-foreground"
					/>
					<Input
						type="search"
						data-testid="mq-overview-search"
						aria-label={SEARCH_PLACEHOLDER}
						placeholder={SEARCH_PLACEHOLDER}
						value={searchText}
						onChange={(event): void => setSearchText(event.target.value)}
						className="tw:h-9 tw:bg-surface-raised tw:pl-9 tw:dark:bg-surface-raised"
					/>
				</div>
				<CeleryOverviewConfigOptions />
			</div>
			<CeleryOverviewTable
				onRowClick={setDetails}
				searchText={searchText}
				onSearchChange={setSearchText}
				selectedRowKey={details?.key}
			/>
			{details && (
				<CeleryOverviewDetails
					details={details}
					onClose={(): void => setDetails(null)}
				/>
			)}
		</div>
	);
}
