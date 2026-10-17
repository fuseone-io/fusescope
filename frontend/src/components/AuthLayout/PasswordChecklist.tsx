import { cn } from 'lib/utils';
import { Check, Dot } from 'lucide-react';

import {
	getPasswordRequirements,
	hasDisallowedCharacters,
	PASSWORD_SYMBOLS,
} from './passwordPolicy';

interface PasswordChecklistProps {
	id?: string;
	password: string;
}

function PasswordChecklist({
	id,
	password,
}: PasswordChecklistProps): JSX.Element {
	const requirements = getPasswordRequirements(password);

	return (
		<div id={id} className="tw:flex tw:flex-col tw:gap-1 tw:pt-1">
			<ul
				aria-label="Password requirements"
				className="tw:flex tw:flex-wrap tw:gap-x-4 tw:gap-y-1"
			>
				{requirements.map(({ id: requirementId, label, met }) => {
					const Icon = met ? Check : Dot;
					return (
						<li
							key={requirementId}
							data-state={met ? 'met' : 'unmet'}
							className={cn(
								'tw:flex tw:items-center tw:gap-2 tw:text-xs',
								met ? 'tw:text-success-ink' : 'tw:text-subtle-foreground',
							)}
						>
							<Icon
								aria-hidden="true"
								strokeWidth={met ? 2.25 : 3}
								className="tw:size-3.5"
							/>
							<span>{label}</span>
							<span className="tw:sr-only">{met ? '(met)' : '(not met)'}</span>
						</li>
					);
				})}
			</ul>
			{hasDisallowedCharacters(password) && (
				<p className="tw:text-xs tw:text-error-ink">
					Use only letters, numbers and these symbols:{' '}
					<span className="tw:font-mono">{PASSWORD_SYMBOLS}</span>
				</p>
			)}
		</div>
	);
}

PasswordChecklist.defaultProps = {
	id: undefined,
};

export default PasswordChecklist;
