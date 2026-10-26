import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import TagChip from 'components/PageTemplate/components/TagChip';
import { Button } from 'components/ui/button';
import { X } from 'lucide-react';

import { RumtypesPlatformDTO } from 'api/generated/services/fuseScope.schemas';

import { ANDROID_ERROR_SOURCES, WEB_ERROR_SOURCES } from '../constants';
import { useErrorFilters } from '../hooks/useErrorFilters';
import { ErrorFilters } from '../types';
import ErrorSearch from './ErrorSearch';

type SourceOption = ErrorFilters['source'] | 'all';

interface ErrorFiltersBarProps {
	platform?: RumtypesPlatformDTO;
}

const sourceOptions = (
	platform: RumtypesPlatformDTO | undefined,
): { value: SourceOption; label: string; testId: string }[] => [
	{
		value: 'all',
		label: 'All sources',
		testId: 'rum-errors-source-all',
	},
	...(platform === RumtypesPlatformDTO.android
		? ANDROID_ERROR_SOURCES
		: WEB_ERROR_SOURCES
	).map((source) => ({
		value: source,
		label: source,
		testId: `rum-errors-source-${source}`,
	})),
];

function ErrorFiltersBar({ platform }: ErrorFiltersBarProps): JSX.Element {
	const [filters, update] = useErrorFilters();
	return (
		<>
			<ErrorSearch
				key={filters.search}
				value={filters.search}
				onChange={(search): void => update({ search })}
			/>
			<span title="fusescope.rum.error.source">
				<SegmentedControl<SourceOption>
					label="Error source"
					options={sourceOptions(platform)}
					value={filters.source || 'all'}
					onChange={(next): void => update({ source: next === 'all' ? '' : next })}
				/>
			</span>
			{filters.route && (
				<span className="tw:inline-flex tw:items-center tw:gap-1 tw:text-[13px] tw:text-muted-foreground">
					Route
					<TagChip testId="rum-errors-route">{filters.route}</TagChip>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Clear the route filter"
						data-testid="rum-errors-route-clear"
						onClick={(): void => update({ route: '' })}
					>
						<X />
					</Button>
				</span>
			)}
		</>
	);
}

export default ErrorFiltersBar;
