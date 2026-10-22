import { ApplicationFormValues } from '../types';
import { invalidOrigin, invalidUrlPrefix } from '../utils/form';
import ChipsInput from './ChipsInput';
import Field from './Field';
import SectionHeading from './SectionHeading';
import WhereTag from './WhereTag';

interface OriginsSectionProps {
	values: ApplicationFormValues;
	onChange: (patch: Partial<ApplicationFormValues>) => void;
	readOnly: boolean;
}

function OriginsSection({
	values,
	onChange,
	readOnly,
}: OriginsSectionProps): JSX.Element {
	return (
		<section
			aria-labelledby="rum-app-network"
			className="tw:flex tw:flex-col tw:gap-4 tw:border-t tw:border-border tw:pt-5"
		>
			<SectionHeading id="rum-app-network">Origins and tracing</SectionHeading>
			<Field
				label={
					<>
						Allowed origins <WhereTag where="Server" />
					</>
				}
				htmlFor="rum-app-origins"
				description={
					<>
						Data from any other origin is rejected. Use{' '}
						<span className="tw:font-mono">https://*.example.com</span> for
						subdomains.
					</>
				}
			>
				<ChipsInput
					id="rum-app-origins"
					label="Allowed origins"
					testId="rum-app-origins"
					values={values.allowedOrigins}
					onChange={(allowedOrigins): void => onChange({ allowedOrigins })}
					validate={invalidOrigin}
					placeholder="https://… then Enter"
					disabled={readOnly}
				/>
			</Field>
			<Field
				label={
					<>
						Link requests to backend traces <WhereTag where="SDK" />
					</>
				}
				htmlFor="rum-app-propagation"
				description={
					<>
						The SDK sends <span className="tw:font-mono">traceparent</span> to these
						URLs. Their CORS must allow that header. Same-origin requests are always
						linked.
					</>
				}
			>
				<ChipsInput
					id="rum-app-propagation"
					label="Trace propagation URLs"
					testId="rum-app-propagation"
					values={values.tracePropagationUrls}
					onChange={(tracePropagationUrls): void =>
						onChange({ tracePropagationUrls })
					}
					validate={invalidUrlPrefix}
					placeholder="API base URL"
					disabled={readOnly}
				/>
			</Field>
			<Field
				label={
					<>
						Session sample rate <WhereTag where="SDK" />
					</>
				}
				htmlFor="rum-app-sample-rate"
				description={
					<>
						Whole sessions are kept or dropped. Dropped sessions send nothing and add
						no <span className="tw:font-mono">traceparent</span>, so backend sampling
						is unaffected.
					</>
				}
			>
				<div className="tw:flex tw:items-center tw:gap-3">
					<input
						id="rum-app-sample-rate"
						aria-label="Session sample rate"
						data-testid="rum-app-sample-rate"
						type="range"
						min={0}
						max={100}
						step={5}
						value={values.samplePercent}
						disabled={readOnly}
						onChange={(event): void =>
							onChange({ samplePercent: Number(event.target.value) })
						}
						className="tw:flex-1 tw:accent-primary"
					/>
					<span className="tw:w-12 tw:text-right tw:font-medium tw:tabular-nums">
						{values.samplePercent}%
					</span>
				</div>
			</Field>
		</section>
	);
}

export default OriginsSection;
