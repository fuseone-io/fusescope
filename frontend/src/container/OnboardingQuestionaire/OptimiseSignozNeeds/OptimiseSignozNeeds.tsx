import { useEffect, useState } from 'react';
import { Slider } from '@signozhq/ui/slider';
import logEvent from 'api/common/logEvent';
import { Minus } from 'lucide-react';

import OnboardingNavButton from '../components/OnboardingNavButton';
import QuestionStep from '../components/QuestionStep';

export interface OptimiseSignozDetails {
	logsPerDay: number;
	hostsPerDay: number;
	services: number;
}

// Define exponential range
const logsMin = 1; // Set to your minimum value in the exponential range
const logsMax = 10000; // Set to your maximum value in the exponential range

const hostsMin = 1;
const hostsMax = 10000;

const servicesMin = 1;
const servicesMax = 5000;

// Function to convert linear slider value to exponential scale
const linearToExponential = (
	value: number,
	min: number,
	max: number,
): number => {
	const expMin = Math.log10(min);
	const expMax = Math.log10(max);
	const expValue = 10 ** (expMin + ((expMax - expMin) * value) / 100);
	return Math.round(expValue);
};

const exponentialToLinear = (
	expValue: number,
	min: number,
	max: number,
): number => {
	const expMin = Math.log10(min);
	const expMax = Math.log10(max);
	const linearValue =
		((Math.log10(expValue) - expMin) / (expMax - expMin)) * 100;
	return Math.round(linearValue); // Round to get a whole number within the 0-100 range
};

const SLIDER_LABEL =
	'tw:flex tw:items-center tw:gap-1 tw:text-xs tw:font-medium tw:uppercase tw:tracking-wide tw:whitespace-nowrap tw:text-muted-foreground';

const SLIDER_STYLES = { range: { backgroundColor: 'var(--fs-primary)' } };

interface OptimiseSignozNeedsProps {
	optimiseSignozDetails: OptimiseSignozDetails;
	setOptimiseSignozDetails: (details: OptimiseSignozDetails) => void;
	onNext: () => void;
	onWillDoLater: () => void;
	isUpdatingProfile: boolean;
	isNextDisabled: boolean;
}

const marks = {
	0: `${linearToExponential(0, logsMin, logsMax).toLocaleString()} GB`,
	25: `${linearToExponential(25, logsMin, logsMax).toLocaleString()} GB`,
	50: `${linearToExponential(50, logsMin, logsMax).toLocaleString()} GB`,
	75: `${linearToExponential(75, logsMin, logsMax).toLocaleString()} GB`,
	100: `${linearToExponential(100, logsMin, logsMax).toLocaleString()} GB`,
};

const hostMarks = {
	0: `${linearToExponential(0, hostsMin, hostsMax).toLocaleString()}`,
	25: `${linearToExponential(25, hostsMin, hostsMax).toLocaleString()}`,
	50: `${linearToExponential(50, hostsMin, hostsMax).toLocaleString()}`,
	75: `${linearToExponential(75, hostsMin, hostsMax).toLocaleString()}`,
	100: `${linearToExponential(100, hostsMin, hostsMax).toLocaleString()}`,
};

const serviceMarks = {
	0: `${linearToExponential(0, servicesMin, servicesMax).toLocaleString()}`,
	25: `${linearToExponential(25, servicesMin, servicesMax).toLocaleString()}`,
	50: `${linearToExponential(50, servicesMin, servicesMax).toLocaleString()}`,
	75: `${linearToExponential(75, servicesMin, servicesMax).toLocaleString()}`,
	100: `${linearToExponential(100, servicesMin, servicesMax).toLocaleString()}`,
};

function OptimiseSignozNeeds({
	isUpdatingProfile,
	optimiseSignozDetails,
	setOptimiseSignozDetails,
	onNext,
	onWillDoLater,
	isNextDisabled,
}: OptimiseSignozNeedsProps): JSX.Element {
	const [logsPerDay, setLogsPerDay] = useState<number>(
		optimiseSignozDetails?.logsPerDay || 0,
	);
	const [hostsPerDay, setHostsPerDay] = useState<number>(
		optimiseSignozDetails?.hostsPerDay || 0,
	);
	const [services, setServices] = useState<number>(
		optimiseSignozDetails?.services || 0,
	);

	// Internal state for the linear slider
	const [sliderValues, setSliderValues] = useState({
		logsPerDay: 0,
		hostsPerDay: 0,
		services: 0,
	});

	useEffect(() => {
		setSliderValues({
			logsPerDay: exponentialToLinear(logsPerDay, logsMin, logsMax),
			hostsPerDay: exponentialToLinear(hostsPerDay, hostsMin, hostsMax),
			services: exponentialToLinear(services, servicesMin, servicesMax),
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		setOptimiseSignozDetails({
			logsPerDay,
			hostsPerDay,
			services,
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [services, hostsPerDay, logsPerDay]);

	const handleOnNext = (): void => {
		logEvent('Org Onboarding: Answered', {
			logsPerDay,
			hostsPerDay,
			services,
		});

		onNext();
	};

	const handleWillDoLater = (): void => {
		setOptimiseSignozDetails({
			logsPerDay: 0,
			hostsPerDay: 0,
			services: 0,
		});

		onWillDoLater();

		logEvent('Org Onboarding: Clicked Do Later', {
			currentPageID: 3,
		});
	};

	const handleSliderChange = (key: string, value: number): void => {
		setSliderValues({
			...sliderValues,
			[key]: value,
		});

		switch (key) {
			case 'logsPerDay':
				setLogsPerDay(linearToExponential(value, logsMin, logsMax));
				break;
			case 'hostsPerDay':
				setHostsPerDay(linearToExponential(value, hostsMin, hostsMax));
				break;
			case 'services':
				setServices(linearToExponential(value, servicesMin, servicesMax));
				break;
			default:
				break;
		}
	};

	// Calculate the exponential value based on the current slider position
	const logsPerDayValue = linearToExponential(
		sliderValues.logsPerDay,
		logsMin,
		logsMax,
	);
	const hostsPerDayValue = linearToExponential(
		sliderValues.hostsPerDay,
		hostsMin,
		hostsMax,
	);
	const servicesValue = linearToExponential(
		sliderValues.services,
		servicesMin,
		servicesMax,
	);

	return (
		<QuestionStep
			title="Set up your workspace"
			subtitle="Tailor FuseScope to suit your observability needs."
			footer={
				<>
					<OnboardingNavButton
						onClick={handleOnNext}
						loading={isUpdatingProfile}
						disabled={isNextDisabled}
						disabledTooltip="Set at least one of the values above"
						showArrow
					>
						Next
					</OnboardingNavButton>
					<OnboardingNavButton
						variant="secondary"
						onClick={handleWillDoLater}
						loading={isUpdatingProfile}
					>
						I&apos;ll do this later
					</OnboardingNavButton>
				</>
			}
		>
			<p className="fs-ui tw:text-sm tw:font-semibold tw:text-foreground">
				What does your scale approximately look like?
			</p>

			<div className="tw:flex tw:flex-col tw:gap-2">
				<span className={SLIDER_LABEL}>Logs / Day</span>
				<div className="tw:px-2">
					<Slider
						min={0}
						max={100}
						value={sliderValues.logsPerDay}
						marks={marks}
						onChange={(value): void =>
							handleSliderChange('logsPerDay', value as number)
						}
						styles={SLIDER_STYLES}
						tooltip={{
							formatter: (): string => `${logsPerDayValue.toLocaleString()} GB`,
						}}
					/>
				</div>
			</div>

			<div className="tw:flex tw:flex-col tw:gap-2">
				<span className={SLIDER_LABEL}>
					Metrics <Minus size={12} aria-hidden /> Number of Hosts
				</span>
				<div className="tw:px-2">
					<Slider
						min={0}
						max={100}
						value={sliderValues.hostsPerDay}
						marks={hostMarks}
						onChange={(value): void =>
							handleSliderChange('hostsPerDay', value as number)
						}
						styles={SLIDER_STYLES}
						tooltip={{
							formatter: (): string => `${hostsPerDayValue.toLocaleString()}`,
						}}
					/>
				</div>
			</div>

			<div className="tw:flex tw:flex-col tw:gap-2">
				<span className={SLIDER_LABEL}>Number of services</span>
				<div className="tw:px-2">
					<Slider
						min={0}
						max={100}
						value={sliderValues.services}
						marks={serviceMarks}
						onChange={(value): void =>
							handleSliderChange('services', value as number)
						}
						styles={SLIDER_STYLES}
						tooltip={{
							formatter: (): string => `${servicesValue.toLocaleString()}`,
						}}
					/>
				</div>
			</div>
		</QuestionStep>
	);
}

export default OptimiseSignozNeeds;
