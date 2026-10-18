import { useEffect, useMemo, useState } from 'react';
import logEvent from 'api/common/logEvent';
import { Input } from 'components/ui/input';
import { useAppContext } from 'providers/App/App';

import ChoiceChip from '../components/ChoiceChip';
import OnboardingNavButton from '../components/OnboardingNavButton';
import QuestionField from '../components/QuestionField';
import QuestionStep from '../components/QuestionStep';

export interface SignozDetails {
	interestInSignoz: string[] | null;
	otherInterestInSignoz: string | null;
	discoverSignoz: string | null;
}

interface AboutSigNozQuestionsProps {
	signozDetails: SignozDetails;
	setSignozDetails: (details: SignozDetails) => void;
	onNext: () => void;
}

const interestedInOptions: Record<string, string> = {
	loweringCosts: 'Lowering observability costs',
	otelNativeStack: 'Interested in OTel-native stack',
	deploymentFlexibility: 'Deployment flexibility (Cloud/Self-Host) in future',
	singleTool:
		'Single Tool (logs, metrics & traces) to reduce operational overhead',
	correlateSignals: 'Correlate signals for faster troubleshooting',
	openSourceTooling: 'Prefer open-source tooling',
};

const DISCOVER_QUESTION = 'How did you first come across FuseScope?';

function seededShuffle<T>(array: T[], seed: string): T[] {
	const result = [...array];

	let num = 0;
	for (let i = 0; i < seed.length; i++) {
		num = Math.imul(num + seed.charCodeAt(i), 2654435761);
		num = Math.abs(num);
	}

	for (let i = result.length - 1; i > 0; i--) {
		num = Math.abs(Math.imul(num, 1664525) + 1013904223);
		const j = num % (i + 1);
		[result[i], result[j]] = [result[j], result[i]];
	}

	return result;
}

export function AboutSigNozQuestions({
	signozDetails,
	setSignozDetails,
	onNext,
}: AboutSigNozQuestionsProps): JSX.Element {
	const { versionData } = useAppContext();

	const [interestInSignoz, setInterestInSignoz] = useState<string[]>(
		signozDetails?.interestInSignoz || [],
	);
	const [otherInterestInSignoz, setOtherInterestInSignoz] = useState<string>(
		signozDetails?.otherInterestInSignoz || '',
	);
	const [discoverSignoz, setDiscoverSignoz] = useState<string>(
		signozDetails?.discoverSignoz || '',
	);
	const [isNextDisabled, setIsNextDisabled] = useState<boolean>(true);

	const shuffledOptionKeys = useMemo(
		() =>
			seededShuffle(Object.keys(interestedInOptions), versionData?.version ?? ''),
		[versionData?.version],
	);

	useEffect((): void => {
		if (
			discoverSignoz !== '' &&
			interestInSignoz.length > 0 &&
			(!interestInSignoz.includes('Others') || otherInterestInSignoz !== '')
		) {
			setIsNextDisabled(false);
		} else {
			setIsNextDisabled(true);
		}
	}, [interestInSignoz, otherInterestInSignoz, discoverSignoz]);

	const handleInterestChange = (option: string, checked: boolean): void => {
		if (checked) {
			setInterestInSignoz((prev) => [...prev, option]);
		} else {
			setInterestInSignoz((prev) => prev.filter((item) => item !== option));
		}
	};

	const createInterestChangeHandler =
		(option: string) =>
		(checked: boolean): void => {
			handleInterestChange(option, checked);
		};

	const getNextDisabledReason = (): string => {
		if (discoverSignoz === '') {
			return 'Tell us how you first came across FuseScope';
		}
		if (interestInSignoz.length === 0) {
			return 'Select what got you interested in FuseScope';
		}
		return 'Describe what got you interested in FuseScope';
	};

	const handleOnNext = (): void => {
		setSignozDetails({
			discoverSignoz,
			interestInSignoz,
			otherInterestInSignoz,
		});

		logEvent('Org Onboarding: Answered', {
			discoverSignoz,
			interestInSignoz,
			otherInterestInSignoz,
		});

		onNext();
	};

	return (
		<QuestionStep
			title="Set up your workspace"
			subtitle="Tailor FuseScope to suit your observability needs."
			footer={
				<OnboardingNavButton
					onClick={handleOnNext}
					disabled={isNextDisabled}
					disabledTooltip={getNextDisabledReason()}
					showArrow
				>
					Next
				</OnboardingNavButton>
			}
		>
			<QuestionField question={DISCOVER_QUESTION}>
				<textarea
					aria-label={DISCOVER_QUESTION}
					className="tw:min-h-20 tw:w-full tw:resize-none tw:rounded-md tw:border tw:border-input tw:bg-transparent tw:px-3 tw:py-2 tw:text-sm tw:text-foreground tw:shadow-xs tw:outline-none tw:placeholder:text-muted-foreground tw:focus-visible:border-ring tw:focus-visible:ring-[3px] tw:focus-visible:ring-ring/50 tw:dark:bg-input/30"
					placeholder="e.g., I asked ChatGPT for Datadog alternatives, searched Google for “OpenTelemetry tools,” saw a Reddit or LinkedIn post, or heard about it from a colleague."
					value={discoverSignoz}
					autoFocus
					rows={4}
					onChange={(e): void => setDiscoverSignoz(e.target.value)}
				/>
			</QuestionField>

			<QuestionField question="What got you interested in FuseScope?">
				<div className="tw:flex tw:flex-col tw:gap-2">
					{shuffledOptionKeys.map((option: string) => (
						<ChoiceChip
							key={option}
							type="checkbox"
							name="interestInSignoz"
							value={option}
							checked={interestInSignoz.includes(option)}
							onChange={createInterestChangeHandler(option)}
						>
							{interestedInOptions[option]}
						</ChoiceChip>
					))}

					<ChoiceChip
						type="checkbox"
						name="interestInSignoz"
						value="Others"
						checked={interestInSignoz.includes('Others')}
						onChange={createInterestChangeHandler('Others')}
					>
						Others
					</ChoiceChip>
				</div>
				{interestInSignoz.includes('Others') && (
					<Input
						type="text"
						className="tw:h-10"
						placeholder="What got you interested in FuseScope?"
						value={otherInterestInSignoz}
						autoFocus
						onChange={(e): void => setOtherInterestInSignoz(e.target.value)}
					/>
				)}
			</QuestionField>
		</QuestionStep>
	);
}
