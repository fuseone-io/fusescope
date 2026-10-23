import { cn } from 'lib/utils';

interface EntryLogoProps {
	icon?: string;
	initials: string;
	className?: string;
}

/** A 36px tile with the source's logo, or its initials when it has none. */
function EntryLogo({ icon, initials, className }: EntryLogoProps): JSX.Element {
	return (
		<span
			aria-hidden="true"
			className={cn(
				'tw:flex tw:size-9 tw:flex-none tw:items-center tw:justify-center tw:rounded-lg tw:border tw:border-border tw:bg-surface-sunken tw:text-xs tw:font-semibold tw:text-muted-foreground',
				className,
			)}
		>
			{icon ? (
				<img src={icon} alt="" className="tw:size-5 tw:object-contain" />
			) : (
				initials
			)}
		</span>
	);
}

export default EntryLogo;
