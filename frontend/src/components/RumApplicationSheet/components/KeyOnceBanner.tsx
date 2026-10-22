import { TriangleAlert } from 'lucide-react';

import CopyButton from './CopyButton';

interface KeyOnceBannerProps {
	applicationKey: string;
	applicationName: string;
	/** Where the snippet carrying the key is, from where the banner shows. */
	snippetPlace?: 'below' | 'install';
}

/** The plaintext key right after it is issued; the server cannot show it again. */
function KeyOnceBanner({
	applicationKey,
	applicationName,
	snippetPlace = 'below',
}: KeyOnceBannerProps): JSX.Element {
	return (
		<section
			aria-labelledby="rum-key-once"
			data-testid="rum-key-once"
			className="tw:flex tw:flex-col tw:gap-2.5 tw:rounded-[10px] tw:bg-warning-soft tw:px-4 tw:py-3.5 tw:text-warning-ink"
		>
			<div className="tw:flex tw:items-center tw:gap-2">
				<TriangleAlert aria-hidden="true" className="tw:size-4" />
				<h3 id="rum-key-once" className="tw:text-sm tw:font-semibold">
					Copy your public key now. It is shown once.
				</h3>
			</div>
			<div className="tw:flex tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised tw:py-1 tw:pr-1 tw:pl-3">
				<span
					data-testid="rum-key-value"
					className="tw:min-w-0 tw:flex-1 tw:truncate tw:font-mono tw:text-[13px] tw:text-foreground"
				>
					{applicationKey}
				</span>
				<CopyButton value={applicationKey} label="Copy key" testId="rum-key-copy" />
			</div>
			<span className="tw:text-xs">
				Safe to ship in your bundle: it can only send data for{' '}
				<span className="tw:font-mono">{applicationName}</span> from its allowed
				origins.{' '}
				<span className="translate-safe">
					{snippetPlace === 'below'
						? 'It is already in the snippet below. Lost it? Rotate it on the Public key tab.'
						: 'It is in the snippet on the Install tab until this sheet closes.'}
				</span>
			</span>
		</section>
	);
}

export default KeyOnceBanner;
