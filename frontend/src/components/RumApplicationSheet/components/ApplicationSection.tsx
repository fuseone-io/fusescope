import { RumtypesPlatformDTO } from 'api/generated/services/fuseScope.schemas';
import { Input } from 'components/ui/input';
import { PLATFORM_LABELS } from 'lib/rum/platform';
import { cn } from 'lib/utils';
import { AppWindow, Smartphone } from 'lucide-react';

import { ApplicationFormValues } from '../types';
import Field from './Field';

interface ApplicationSectionProps {
	values: ApplicationFormValues;
	onChange: (patch: Partial<ApplicationFormValues>) => void;
	/** The platform is chosen once, at creation. */
	creating: boolean;
	errors: Partial<Record<'name' | 'environment', string>>;
	readOnly: boolean;
}

const INPUT =
	'tw:h-9 tw:bg-surface-raised tw:font-mono tw:text-xs tw:dark:bg-surface-raised';
const ENVIRONMENTS = ['production', 'staging', 'development'];
const PLATFORMS = [
	{ value: RumtypesPlatformDTO.web, note: 'Browser SDK', available: true },
	{
		value: RumtypesPlatformDTO.android,
		note: 'Android SDK · Java and Kotlin',
		available: true,
	},
	{ value: RumtypesPlatformDTO.ios, note: 'Coming soon', available: false },
];

function ApplicationSection({
	values,
	onChange,
	creating,
	errors,
	readOnly,
}: ApplicationSectionProps): JSX.Element {
	const { platform } = values;
	return (
		<section aria-label="Application" className="tw:flex tw:flex-col tw:gap-4">
			<div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(260px,1fr))] tw:gap-4">
				<Field
					label="Name"
					htmlFor="rum-app-name"
					error={errors.name}
					description={
						<>
							Sent as <span className="tw:font-mono">service.name</span>. Lowercase
							letters, digits and dashes.
						</>
					}
				>
					<Input
						id="rum-app-name"
						aria-label="Name"
						data-testid="rum-app-name"
						value={values.name}
						disabled={readOnly}
						placeholder="web-shop"
						onChange={(event): void => onChange({ name: event.target.value })}
						className={INPUT}
					/>
				</Field>
				<Field
					label="Environment"
					htmlFor="rum-app-environment"
					error={errors.environment}
					description={
						<>
							Sent as <span className="tw:font-mono">deployment.environment.name</span>
							. One application per environment.
						</>
					}
				>
					<Input
						id="rum-app-environment"
						aria-label="Environment"
						data-testid="rum-app-environment"
						list="rum-app-environments"
						value={values.environment}
						disabled={readOnly}
						onChange={(event): void => onChange({ environment: event.target.value })}
						className={INPUT}
					/>
					<datalist id="rum-app-environments">
						{ENVIRONMENTS.map((environment) => (
							<option key={environment} value={environment} aria-label={environment} />
						))}
					</datalist>
				</Field>
			</div>
			<fieldset className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5">
				<legend className="tw:mb-1.5 tw:text-[13px] tw:font-medium">
					Platform
				</legend>
				<div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] tw:gap-2">
					{PLATFORMS.map((option) => {
						const selected = option.value === platform;
						const { available } = option;
						const selectable = available && creating && !readOnly;
						return (
							<label
								key={option.value}
								className={cn(
									'tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:px-3 tw:py-2.5',
									selected
										? 'tw:border-primary tw:bg-primary-soft/40'
										: 'tw:border-border tw:text-muted-foreground',
									selectable ? 'tw:cursor-pointer' : 'tw:cursor-not-allowed',
								)}
							>
								<input
									type="radio"
									name="rum-app-platform"
									aria-label={PLATFORM_LABELS[option.value]}
									data-testid={`rum-app-platform-${option.value}`}
									checked={selected}
									disabled={!selectable && !selected}
									onChange={(): void => {
										if (selectable) {
											onChange({ platform: option.value });
										}
									}}
									className="tw:accent-primary"
								/>
								{option.value === RumtypesPlatformDTO.web ? (
									<AppWindow aria-hidden="true" className="tw:size-4" />
								) : (
									<Smartphone aria-hidden="true" className="tw:size-4" />
								)}
								<span className="tw:flex tw:flex-col tw:leading-tight">
									<span className="tw:font-medium">{PLATFORM_LABELS[option.value]}</span>
									<span className="tw:text-xs tw:text-muted-foreground">
										{option.note}
									</span>
								</span>
							</label>
						);
					})}
				</div>
			</fieldset>
		</section>
	);
}

export default ApplicationSection;
