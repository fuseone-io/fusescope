import { ReactNode } from 'react';
import { LockKeyhole } from 'lucide-react';

interface LockedValueProps {
	children: ReactNode;
	title?: string;
	/** Controls before the lock, e.g. a copy button. */
	actions?: ReactNode;
}

/** A read-only value drawn like a disabled field, with a lock. */
function LockedValue({
	children,
	title,
	actions,
}: LockedValueProps): JSX.Element {
	return (
		<div
			title={title}
			className="settings-locked-value tw:flex tw:min-h-9 tw:items-center tw:justify-between tw:gap-2 tw:rounded-md tw:border tw:border-border tw:bg-surface-sunken tw:px-3 tw:py-1.5 tw:text-sm tw:text-muted-foreground"
		>
			<div className="tw:min-w-0 tw:flex-1">{children}</div>
			{actions}
			<LockKeyhole className="tw:size-4 tw:flex-none" aria-hidden="true" />
		</div>
	);
}

export default LockedValue;
