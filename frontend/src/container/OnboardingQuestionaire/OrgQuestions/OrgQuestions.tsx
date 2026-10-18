import { useEffect, useState } from 'react';
import logEvent from 'api/common/logEvent';
import { Input } from 'components/ui/input';

import ChoiceChip from '../components/ChoiceChip';
import OnboardingNavButton from '../components/OnboardingNavButton';
import QuestionField from '../components/QuestionField';
import QuestionStep from '../components/QuestionStep';

export interface OrgDetails {
	usesObservability: boolean | null;
	observabilityTool: string | null;
	otherTool: string | null;
	usesOtel: boolean | null;
	migrationTimeline: string | null;
}

interface OrgQuestionsProps {
	orgDetails: OrgDetails;
	onNext: (details: OrgDetails) => void;
}

const observabilityTools = {
	AWSCloudwatch: 'AWS Cloudwatch',
	DataDog: 'DataDog',
	NewRelic: 'New Relic',
	GrafanaPrometheus: 'Grafana / Prometheus',
	AzureAppMonitor: 'Azure App Monitor',
	GCPNativeO11yTools: 'GCP-native o11y tools',
	Honeycomb: 'Honeycomb',
	None: 'None/Starting fresh',
	Others: 'Others',
};

const OTEL_OPTIONS = [
	{ value: 'yes', label: 'Yes' },
	{ value: 'no', label: 'No' },
];

const CHOICE_GRID = 'tw:grid tw:grid-cols-1 tw:gap-2 tw:sm:grid-cols-2';

const migrationTimelineOptions = {
	lessThanMonth: 'Less than a month',
	oneToThreeMonths: '1-3 months',
	greaterThanThreeMonths: 'Greater than 3 months',
	justExploring: 'Just exploring',
};

function OrgQuestions({ orgDetails, onNext }: OrgQuestionsProps): JSX.Element {
	const [observabilityTool, setObservabilityTool] = useState<string | null>(
		orgDetails?.observabilityTool || null,
	);
	const [otherTool, setOtherTool] = useState<string>(
		orgDetails?.otherTool || '',
	);
	const [isNextDisabled, setIsNextDisabled] = useState<boolean>(true);

	const [usesOtel, setUsesOtel] = useState<boolean | null>(orgDetails.usesOtel);
	const [migrationTimeline, setMigrationTimeline] = useState<string | null>(
		orgDetails?.migrationTimeline || null,
	);

	const showMigrationQuestion =
		observabilityTool !== null && observabilityTool !== 'None';

	const handleNext = (): void => {
		const usesObservability =
			!observabilityTool?.includes('None') && observabilityTool !== null;

		logEvent('Org Onboarding: Answered', {
			usesObservability,
			observabilityTool,
			otherTool,
			usesOtel,
			migrationTimeline,
		});

		onNext({
			usesObservability,
			observabilityTool,
			otherTool,
			usesOtel,
			migrationTimeline,
		});
	};

	const isValidUsesObservability = (): boolean => {
		if (!observabilityTool || observabilityTool === '') {
			return false;
		}

		return !(
			!observabilityTool?.includes('None') &&
			observabilityTool === 'Others' &&
			otherTool === ''
		);
	};

	const getNextDisabledReason = (): string => {
		if (!observabilityTool) {
			return 'Select the observability tool you use';
		}
		if (observabilityTool === 'Others' && otherTool === '') {
			return 'Enter the observability tool you use';
		}
		if (showMigrationQuestion && migrationTimeline === null) {
			return 'Select your migration timeline';
		}
		return 'Tell us if you already use OpenTelemetry';
	};

	useEffect(() => {
		const isValidObservability = isValidUsesObservability();
		const isMigrationValid = !showMigrationQuestion || migrationTimeline !== null;

		if (usesOtel !== null && isValidObservability && isMigrationValid) {
			setIsNextDisabled(false);
		} else {
			setIsNextDisabled(true);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		usesOtel,
		observabilityTool,
		otherTool,
		migrationTimeline,
		showMigrationQuestion,
	]);

	const handleObservabilityToolChange = (value: string): void => {
		setObservabilityTool(value);
		if (value !== 'Others') {
			setOtherTool('');
		}
		if (value === 'None') {
			setMigrationTimeline(null);
		}
	};

	const handleOtelChange = (value: string): void => {
		setUsesOtel(value === 'yes');
	};

	return (
		<QuestionStep
			icon="🎉"
			title="Welcome to FuseScope Cloud"
			subtitle="Let's get you started"
			footer={
				<OnboardingNavButton
					onClick={handleNext}
					disabled={isNextDisabled}
					disabledTooltip={getNextDisabledReason()}
					showArrow
				>
					Next
				</OnboardingNavButton>
			}
		>
			<QuestionField question="Which observability tool do you currently use?">
				<div className={CHOICE_GRID}>
					{Object.entries(observabilityTools).map(([tool, label]) => (
						<ChoiceChip
							key={tool}
							type="radio"
							name="observabilityTool"
							value={tool}
							checked={observabilityTool === tool}
							onChange={(): void => handleObservabilityToolChange(tool)}
						>
							{label}
						</ChoiceChip>
					))}
				</div>
				{observabilityTool === 'Others' && (
					<Input
						type="text"
						className="tw:h-10"
						placeholder="What tool do you currently use?"
						value={otherTool || ''}
						autoFocus
						onChange={(e): void => setOtherTool(e.target.value)}
					/>
				)}
			</QuestionField>

			{showMigrationQuestion && (
				<QuestionField question="What is your timeline for migrating to FuseScope?">
					<div className={CHOICE_GRID}>
						{Object.entries(migrationTimelineOptions).map(([key, label]) => (
							<ChoiceChip
								key={key}
								type="radio"
								name="migrationTimeline"
								value={key}
								checked={migrationTimeline === key}
								onChange={(): void => setMigrationTimeline(key)}
							>
								{label}
							</ChoiceChip>
						))}
					</div>
				</QuestionField>
			)}

			<QuestionField question="Do you already use OpenTelemetry?">
				<div className={CHOICE_GRID}>
					{OTEL_OPTIONS.map(({ value, label }) => (
						<ChoiceChip
							key={value}
							type="radio"
							name="usesOtel"
							value={value}
							checked={usesOtel === (value === 'yes')}
							onChange={(): void => handleOtelChange(value)}
						>
							{label}
						</ChoiceChip>
					))}
				</div>
			</QuestionField>
		</QuestionStep>
	);
}

export default OrgQuestions;
