import { useMemo } from 'react';
import logEvent from 'api/common/logEvent';
import { Switch } from 'components/ui/switch';
import { cn } from 'lib/utils';
import { X } from 'lucide-react';
import { useTimezone } from 'providers/Timezone';

import PreferenceRow from '../PreferenceRow';

function TimezoneAdaptation(): JSX.Element {
	const {
		timezone,
		browserTimezone,
		updateTimezone,
		isAdaptationEnabled,
		setIsAdaptationEnabled,
	} = useTimezone();

	const isTimezoneOverridden = useMemo(
		() => timezone.offset !== browserTimezone.offset,
		[timezone, browserTimezone],
	);

	const handleOverrideClear = (): void => {
		updateTimezone(browserTimezone);
		logEvent('Account Settings: Timezone override cleared', {});
	};

	const handleSwitchChange = (): void => {
		setIsAdaptationEnabled((prev) => {
			const isEnabled = !prev;
			logEvent(
				`Account Settings: Timezone adaptation ${
					isEnabled ? 'enabled' : 'disabled'
				}`,
				{},
			);
			return isEnabled;
		});
	};

	return (
		<PreferenceRow
			className="timezone-adaption"
			title="Adapt to my timezone"
			description="Adapt the timestamps shown in the FuseScope console to my active timezone."
			control={
				<Switch
					aria-label="Adapt to my timezone"
					checked={isAdaptationEnabled}
					onCheckedChange={handleSwitchChange}
					data-testid="timezone-adaptation-switch"
					className={cn(
						isAdaptationEnabled &&
							isTimezoneOverridden &&
							'tw:data-[state=checked]:bg-warning',
					)}
				/>
			}
		>
			<div className="timezone-adaption__note tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:rounded-md tw:bg-primary-soft tw:px-3 tw:py-2 tw:text-xs tw:text-primary-ink">
				<span className="timezone-adaption__note-text tw:flex tw:items-center tw:gap-1">
					{isTimezoneOverridden ? (
						<>
							Your current timezone is overridden to
							<span className="timezone-adaption__note-text-overridden tw:font-mono tw:font-medium tw:text-foreground">
								{timezone.offset}
							</span>
						</>
					) : (
						<>
							You can override the timezone adaption for any view with the time picker.
						</>
					)}
				</span>

				{!!isTimezoneOverridden && (
					<button
						type="button"
						className="timezone-adaption__clear-override tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-1 tw:border-0 tw:bg-transparent tw:p-0 tw:text-xs tw:font-medium tw:text-primary-ink tw:hover:underline"
						onClick={handleOverrideClear}
					>
						<X className="tw:size-3" aria-hidden="true" />
						Clear override
					</button>
				)}
			</div>
		</PreferenceRow>
	);
}

export default TimezoneAdaptation;
