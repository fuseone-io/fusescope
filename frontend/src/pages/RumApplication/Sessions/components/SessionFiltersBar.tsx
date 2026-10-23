import { useListRUMViews } from 'api/generated/services/rum';
import { NativeSelect, NativeSelectOption } from 'components/ui/native-select';
import { Switch } from 'components/ui/switch';
import { useApmWindow } from 'lib/apm/useApmWindow';

import {
	COMMON_BROWSERS,
	CUSTOM_DURATION,
	DURATION_RANGES,
} from '../constants';
import { useSessionFilters } from '../hooks/useSessionFilters';
import { durationRangeOf } from '../utils';
import UserIdFilter from './UserIdFilter';

interface SessionFiltersBarProps {
	applicationId: string;
}

const LABEL =
	'tw:flex tw:items-center tw:gap-2 tw:text-[13px] tw:text-muted-foreground';

function SessionFiltersBar({
	applicationId,
}: SessionFiltersBarProps): JSX.Element {
	const [filters, update] = useSessionFilters();
	const window = useApmWindow();
	const views = useListRUMViews(
		{ id: applicationId },
		{ start: window.start, end: window.end },
	);
	const routes = (views.data?.data.routes ?? []).map((route) => route.route);
	const browsers = [...new Set([...COMMON_BROWSERS, filters.browser])].filter(
		Boolean,
	);
	const duration = durationRangeOf(filters.minDurationMs, filters.maxDurationMs);

	return (
		<>
			<label className={LABEL}>
				Browser
				<NativeSelect
					data-testid="rum-sessions-browser"
					value={filters.browser}
					onChange={(event): void => update({ browser: event.target.value })}
					className="tw:font-medium"
				>
					<NativeSelectOption value="">All</NativeSelectOption>
					{browsers.map((browser) => (
						<NativeSelectOption key={browser} value={browser}>
							{browser}
						</NativeSelectOption>
					))}
				</NativeSelect>
			</label>
			<label className={LABEL}>
				Route
				<NativeSelect
					data-testid="rum-sessions-route"
					value={filters.route}
					onChange={(event): void => update({ route: event.target.value })}
					className="tw:font-mono tw:text-xs"
				>
					<NativeSelectOption value="">Any</NativeSelectOption>
					{[...new Set([...routes, filters.route])].filter(Boolean).map((route) => (
						<NativeSelectOption key={route} value={route}>
							{route}
						</NativeSelectOption>
					))}
				</NativeSelect>
			</label>
			<label className={LABEL}>
				Duration
				<NativeSelect
					data-testid="rum-sessions-duration"
					value={duration}
					onChange={(event): void => {
						const range = DURATION_RANGES.find(
							(candidate) => candidate.value === event.target.value,
						);
						update({
							minDurationMs: range?.minDurationMs,
							maxDurationMs: range?.maxDurationMs,
						});
					}}
					className="tw:font-medium"
				>
					{DURATION_RANGES.map((range) => (
						<NativeSelectOption key={range.value} value={range.value}>
							{range.label}
						</NativeSelectOption>
					))}
					{duration === CUSTOM_DURATION && (
						<NativeSelectOption value={CUSTOM_DURATION} disabled>
							Custom
						</NativeSelectOption>
					)}
				</NativeSelect>
			</label>
			<UserIdFilter
				key={filters.userId}
				value={filters.userId}
				onChange={(next): void => update({ userId: next })}
			/>
			<span className={LABEL}>
				<Switch
					id="rum-sessions-has-error"
					data-testid="rum-sessions-has-error"
					checked={filters.hasError}
					onCheckedChange={(checked): void => update({ hasError: checked })}
				/>
				<label htmlFor="rum-sessions-has-error">Has error</label>
			</span>
		</>
	);
}

export default SessionFiltersBar;
