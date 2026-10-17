import { Check } from 'lucide-react';
import { OrgSessionContext } from 'types/api/v2/sessions/context/get';

import { AUTH_LABEL_CLASS } from './classNames';
import { orgDisplayName, orgInitials } from './utils';

interface OrgPickerProps {
	orgs: OrgSessionContext[];
	value?: string;
	onChange: (orgId: string) => void;
	describe?: (org: OrgSessionContext) => string;
}

function OrgPicker({
	orgs,
	value,
	onChange,
	describe,
}: OrgPickerProps): JSX.Element {
	return (
		<fieldset data-testid="orgId" className="tw:flex tw:flex-col tw:gap-2">
			<legend className={`${AUTH_LABEL_CLASS} tw:mb-1.5`}>Workspace</legend>
			{orgs.map((org) => {
				const name = orgDisplayName(org);
				const description = describe?.(org);
				const descriptionId = `org-${org.id}-description`;

				return (
					<label
						key={org.id}
						className="tw:group tw:flex tw:cursor-pointer tw:items-center tw:gap-3 tw:rounded-md tw:border tw:border-border tw:bg-card tw:p-3 tw:hover:bg-muted tw:has-checked:border-primary tw:has-checked:ring-1 tw:has-checked:ring-primary tw:has-focus-visible:ring-[3px] tw:has-focus-visible:ring-ring/50"
					>
						<input
							type="radio"
							name="orgId"
							value={org.id}
							checked={value === org.id}
							onChange={(): void => onChange(org.id)}
							aria-label={name}
							aria-describedby={description ? descriptionId : undefined}
							className="tw:sr-only"
						/>
						<span
							aria-hidden="true"
							className="tw:flex tw:size-8 tw:flex-none tw:items-center tw:justify-center tw:rounded-md tw:bg-muted tw:text-[13px] tw:font-semibold tw:text-muted-foreground tw:group-has-checked:bg-primary-soft tw:group-has-checked:text-primary-ink"
						>
							{orgInitials(name)}
						</span>
						<span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:leading-snug">
							<span className="tw:truncate tw:font-medium">{name}</span>
							{description && (
								<span
									id={descriptionId}
									className="tw:text-xs tw:text-muted-foreground"
								>
									{description}
								</span>
							)}
						</span>
						<Check
							aria-hidden="true"
							strokeWidth={2}
							className="tw:hidden tw:size-[18px] tw:text-primary tw:group-has-checked:block"
						/>
					</label>
				);
			})}
		</fieldset>
	);
}

OrgPicker.defaultProps = {
	value: undefined,
	describe: undefined,
};

export default OrgPicker;
