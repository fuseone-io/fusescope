import { formatCount } from 'lib/apm/format';
import { plural } from 'lib/rum/format';
import { Info } from 'lucide-react';

interface UnknownLoadsHintProps {
	views: number;
}

/** Views from SDKs before 0.2.0 carry no loading type to split them by. */
function UnknownLoadsHint({ views }: UnknownLoadsHintProps): JSX.Element {
	return (
		<p
			data-testid="rum-views-unknown-loads"
			className="tw:m-0 tw:flex tw:items-start tw:gap-2 tw:border-b tw:border-border tw:bg-surface-sunken tw:px-5 tw:py-2.5 tw:text-xs tw:text-muted-foreground"
		>
			<Info aria-hidden="true" className="tw:mt-px tw:size-3.5 tw:flex-none" />
			<span>
				<span className="tw:tabular-nums">{formatCount(views)}</span>{' '}
				{plural(views, 'view')} (*) came from SDKs before 0.2.0 and are not split
				into page loads and route changes. Update to{' '}
				<span className="tw:font-mono">@fusescope/browser</span> 0.2.0 or later for
				the split.
			</span>
		</p>
	);
}

export default UnknownLoadsHint;
