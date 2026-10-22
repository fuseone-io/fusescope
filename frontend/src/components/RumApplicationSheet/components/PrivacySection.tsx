import { ReactNode } from 'react';
import SoonBadge from 'components/Rum/SoonBadge';
import { Switch } from 'components/ui/switch';

import { ApplicationFormValues } from '../types';
import ChipsInput from './ChipsInput';
import SectionHeading from './SectionHeading';
import WhereTag from './WhereTag';

interface PrivacySectionProps {
	values: ApplicationFormValues;
	onChange: (patch: Partial<ApplicationFormValues>) => void;
	readOnly: boolean;
}

type Toggle = 'dropQuery' | 'geoLookup' | 'requireConsent' | 'hashUserId';

interface RowProps {
	name: Toggle;
	label: string;
	where: 'Server' | 'SDK';
	description: ReactNode;
	children?: ReactNode;
	soon?: boolean;
}

const MONO = 'tw:font-mono';

function PrivacySection({
	values,
	onChange,
	readOnly,
}: PrivacySectionProps): JSX.Element {
	const row = ({
		name,
		label,
		where,
		description,
		children,
		soon = false,
	}: RowProps): JSX.Element => {
		const labelId = `rum-app-${name}`;
		return (
			<div
				key={name}
				className="tw:flex tw:items-start tw:gap-3 tw:py-3"
				title={soon ? `${label} is coming soon` : undefined}
			>
				<Switch
					aria-labelledby={labelId}
					data-testid={labelId}
					checked={!soon && values[name]}
					disabled={readOnly || soon}
					onCheckedChange={(checked): void => onChange({ [name]: checked })}
					className="tw:mt-0.5"
				/>
				<div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-2">
					<div className="tw:flex tw:flex-col">
						<span
							id={labelId}
							className="tw:flex tw:items-center tw:gap-1.5 tw:text-[13px] tw:font-medium"
						>
							{label}
							{soon ? (
								<span data-testid={`${labelId}-soon`}>
									<SoonBadge />
								</span>
							) : (
								<WhereTag where={where} />
							)}
						</span>
						<span className="tw:text-xs tw:text-subtle-foreground">
							{description}
						</span>
					</div>
					{children}
				</div>
			</div>
		);
	};

	return (
		<section
			aria-labelledby="rum-app-privacy"
			className="tw:flex tw:flex-col tw:border-t tw:border-border tw:pt-5"
		>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2">
				<SectionHeading id="rum-app-privacy">Privacy</SectionHeading>
				<span className="tw:text-xs tw:text-subtle-foreground">
					Form inputs and typed text are never captured.
				</span>
			</div>
			<div className="tw:flex tw:flex-col tw:divide-y tw:divide-border">
				{row({
					name: 'dropQuery',
					label: 'Drop query strings and fragments',
					where: 'Server',
					description: (
						<>
							From URLs, span names and attributes.{' '}
							<span className={MONO}>/search?q=boots#top</span> →{' '}
							<span className={MONO}>/search</span>
						</>
					),
					children: values.dropQuery && (
						<div className="tw:flex tw:flex-col tw:gap-1">
							<label
								htmlFor="rum-app-query-allowlist"
								className="tw:text-xs tw:text-muted-foreground"
							>
								Keep these query parameters
							</label>
							<ChipsInput
								id="rum-app-query-allowlist"
								label="Kept query parameters"
								testId="rum-app-query-allowlist"
								values={values.queryAllowlist}
								onChange={(queryAllowlist): void => onChange({ queryAllowlist })}
								placeholder="parameter name"
								disabled={readOnly}
							/>
						</div>
					),
				})}
				{row({
					name: 'geoLookup',
					label: 'Look up country from client IP',
					where: 'Server',
					description:
						'The IP is used for rate limiting and this lookup only. It is never stored.',
					soon: true,
				})}
				{row({
					name: 'requireConsent',
					label: 'Wait for consent',
					where: 'SDK',
					description: (
						<>
							The SDK records nothing until your consent banner calls{' '}
							<span className={MONO}>setConsent(true)</span>.
						</>
					),
				})}
				{row({
					name: 'hashUserId',
					label: 'Hash user IDs',
					where: 'SDK',
					description: (
						<>
							Applies when you call <span className={MONO}>setUser()</span>. Users are
							anonymous otherwise.
						</>
					),
				})}
			</div>
		</section>
	);
}

export default PrivacySection;
