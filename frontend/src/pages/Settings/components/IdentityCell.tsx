import { Avatar, AvatarFallback } from 'components/ui/avatar';

import { initialsOf } from './utils';

interface IdentityCellProps {
	name?: string;
	email: string;
}

/** Avatar initials, then the name over the email; either may truncate. */
function IdentityCell({ name, email }: IdentityCellProps): JSX.Element {
	return (
		<span className="tw:flex tw:min-w-0 tw:items-center tw:gap-2.5">
			<Avatar aria-hidden="true" className="tw:size-7">
				<AvatarFallback className="tw:text-[11px] tw:font-semibold">
					{initialsOf(name || email)}
				</AvatarFallback>
			</Avatar>
			<span className="tw:flex tw:min-w-0 tw:flex-col tw:leading-[1.35]">
				{name && (
					<span className="tw:truncate tw:font-medium" title={name}>
						{name}
					</span>
				)}
				<span
					className="tw:truncate tw:text-xs tw:text-subtle-foreground"
					title={email}
				>
					{email}
				</span>
			</span>
		</span>
	);
}

export default IdentityCell;
