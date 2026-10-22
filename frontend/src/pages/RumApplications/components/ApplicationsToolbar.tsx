import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import SoonBadge from 'components/Rum/SoonBadge';
import { Input } from 'components/ui/input';
import { NativeSelect, NativeSelectOption } from 'components/ui/native-select';
import { Search } from 'lucide-react';

import { SEARCH_PLACEHOLDER } from '../constants';
import { ApplicationFilters, PlatformFilter } from '../types';

interface ApplicationsToolbarProps {
	filters: ApplicationFilters;
	environments: string[];
	onChange: (filters: ApplicationFilters) => void;
}

const PLATFORMS = [
	{ value: 'all' as const, label: 'All platforms' },
	{ value: 'web' as const, label: 'Web' },
	...(['android', 'ios'] as const).map((value) => {
		const label = value === 'ios' ? 'iOS' : 'Android';
		return {
			value,
			label,
			disabled: true,
			title: `${label} SDK is coming soon`,
			badge: <SoonBadge />,
		};
	}),
];

function ApplicationsToolbar({
	filters,
	environments,
	onChange,
}: ApplicationsToolbarProps): JSX.Element {
	return (
		<div className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:font-sans">
			<div className="tw:relative tw:w-full tw:sm:w-72">
				<Search
					aria-hidden="true"
					className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-3 tw:size-4 tw:-translate-y-1/2 tw:text-subtle-foreground"
				/>
				<Input
					type="search"
					data-testid="rum-applications-search"
					aria-label={SEARCH_PLACEHOLDER}
					placeholder={SEARCH_PLACEHOLDER}
					value={filters.search}
					onChange={(event): void =>
						onChange({ ...filters, search: event.target.value })
					}
					className="tw:h-9 tw:bg-surface-raised tw:pl-9 tw:dark:bg-surface-raised"
				/>
			</div>
			<SegmentedControl<PlatformFilter>
				label="Platform"
				options={PLATFORMS.map((option) => ({
					...option,
					testId: `rum-platform-${option.value}`,
				}))}
				value={filters.platform}
				onChange={(platform): void => onChange({ ...filters, platform })}
			/>
			<label className="tw:flex tw:items-center tw:gap-2 tw:text-[13px] tw:text-muted-foreground">
				Environment
				<NativeSelect
					data-testid="rum-environment"
					value={filters.environment}
					onChange={(event): void =>
						onChange({ ...filters, environment: event.target.value })
					}
					className="tw:font-medium"
				>
					<NativeSelectOption value="">All environments</NativeSelectOption>
					{environments.map((environment) => (
						<NativeSelectOption key={environment} value={environment}>
							{environment}
						</NativeSelectOption>
					))}
				</NativeSelect>
			</label>
		</div>
	);
}

export default ApplicationsToolbar;
