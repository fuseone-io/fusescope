import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { SdkSupport } from 'lib/rum/types';

import {
	SDK_SUPPORT_LABELS,
	SDK_SUPPORT_TITLES,
	SDK_SUPPORT_TONES,
} from './constants';

const FUSESCOPE_BROWSER_SDK = '@fusescope/browser';

interface SdkBadgeProps {
	name?: string;
	version?: string;
	support: SdkSupport;
	/** One line: name and version inside the badge. */
	inline?: boolean;
	testId?: string;
}

/** The SDK an application reports, and whether this server supports it. */
function SdkBadge({
	name,
	version,
	support,
	inline = false,
	testId,
}: SdkBadgeProps): JSX.Element {
	const sdk = name ? `${name} ${version ?? ''}`.trim() : '';
	if (inline) {
		return (
			<span title={SDK_SUPPORT_TITLES[support]} className="tw:inline-flex">
				<StatusBadge tone={SDK_SUPPORT_TONES[support]} testId={testId}>
					{sdk && <span className="tw:font-mono">{sdk} ·</span>}
					<span>{SDK_SUPPORT_LABELS[support]}</span>
				</StatusBadge>
			</span>
		);
	}
	return (
		<span
			data-testid={testId}
			className="tw:flex tw:min-w-0 tw:flex-col tw:items-start tw:gap-1"
		>
			<span
				title={sdk || undefined}
				className="tw:font-mono tw:text-xs tw:whitespace-nowrap tw:text-foreground"
			>
				{(name === FUSESCOPE_BROWSER_SDK ? version : sdk) || '—'}
			</span>
			{sdk && (
				<span title={SDK_SUPPORT_TITLES[support]} className="tw:inline-flex">
					<StatusBadge tone={SDK_SUPPORT_TONES[support]}>
						{SDK_SUPPORT_LABELS[support]}
					</StatusBadge>
				</span>
			)}
		</span>
	);
}

export default SdkBadge;
