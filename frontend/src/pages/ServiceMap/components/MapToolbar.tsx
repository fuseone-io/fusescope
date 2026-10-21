import { useId } from 'react';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import { Input } from 'components/ui/input';
import { Switch } from 'components/ui/switch';
import { Search } from 'lucide-react';

import { COLOR_MODES } from '../constants';
import { ColorMode } from '../types';

interface MapToolbarProps {
	search: string;
	onSearch: (term: string) => void;
	colorMode: ColorMode;
	onColorMode: (mode: ColorMode) => void;
	showDependencies: boolean;
	onShowDependencies: (show: boolean) => void;
}

/** Find a service, choose what colours the nodes, show or hide dependencies. */
function MapToolbar({
	search,
	onSearch,
	colorMode,
	onColorMode,
	showDependencies,
	onShowDependencies,
}: MapToolbarProps): JSX.Element {
	const switchId = useId();
	return (
		<div className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-2 tw:border-b tw:border-border tw:px-3 tw:py-2.5 tw:font-sans tw:text-foreground">
			<div className="tw:relative tw:w-full tw:sm:w-48">
				<Search
					aria-hidden="true"
					className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-2.5 tw:size-4 tw:-translate-y-1/2 tw:text-subtle-foreground"
				/>
				<Input
					type="search"
					aria-label="Find a service"
					placeholder="Find a service"
					data-testid="service-map-search"
					value={search}
					onChange={(event): void => onSearch(event.target.value)}
					className="tw:h-8 tw:bg-surface-raised tw:pl-8 tw:text-[13px] tw:dark:bg-surface-raised"
				/>
			</div>
			<span className="tw:text-xs tw:text-muted-foreground">Color by</span>
			<SegmentedControl
				label="Color nodes by"
				options={COLOR_MODES}
				value={colorMode}
				onChange={onColorMode}
			/>
			<label
				htmlFor={switchId}
				className="tw:flex tw:cursor-pointer tw:items-center tw:gap-2 tw:text-[13px] tw:whitespace-nowrap tw:text-muted-foreground"
			>
				<Switch
					id={switchId}
					size="sm"
					checked={showDependencies}
					onCheckedChange={onShowDependencies}
					data-testid="service-map-dependencies-toggle"
				/>
				Dependencies (db, cache, queue)
			</label>
		</div>
	);
}

export default MapToolbar;
