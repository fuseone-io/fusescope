import type { ServiceaccounttypesGettableFactorAPIKeyWithKeyDTO } from 'api/generated/services/fuseScope.schemas';
import { Button } from 'components/ui/button';
import { Check, Copy, Info } from 'lucide-react';

export interface KeyCreatedPhaseProps {
	createdKey: ServiceaccounttypesGettableFactorAPIKeyWithKeyDTO;
	hasCopied: boolean;
	expiryLabel: string;
	onCopy: () => void;
}

function KeyCreatedPhase({
	createdKey,
	hasCopied,
	expiryLabel,
	onCopy,
}: KeyCreatedPhaseProps): JSX.Element {
	return (
		<div className="add-key-modal__form tw:flex tw:flex-col tw:gap-4">
			<div className="tw:flex tw:flex-col tw:gap-2">
				<span className="tw:text-sm tw:font-medium tw:text-foreground">Key</span>
				<div className="add-key-modal__key-display tw:flex tw:items-center tw:gap-2 tw:rounded-md tw:border tw:border-border tw:bg-surface-sunken tw:py-1 tw:pr-1 tw:pl-3">
					<span className="add-key-modal__key-text tw:min-w-0 tw:flex-1 tw:font-mono tw:text-xs tw:break-all tw:text-foreground">
						{createdKey.key}
					</span>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						onClick={onCopy}
						aria-label={hasCopied ? 'Copied' : 'Copy key'}
					>
						{hasCopied ? <Check /> : <Copy />}
					</Button>
				</div>
			</div>

			<div className="add-key-modal__expiry-meta tw:flex tw:items-center tw:gap-2 tw:text-[13px]">
				<span className="tw:text-muted-foreground">Expiration</span>
				<span className="tw:font-medium tw:text-foreground">{expiryLabel}</span>
			</div>

			<div
				role="note"
				className="tw:flex tw:items-start tw:gap-2 tw:rounded-md tw:bg-primary-soft tw:px-3 tw:py-2 tw:text-[13px] tw:text-primary-ink"
			>
				<Info className="tw:mt-0.5 tw:size-4 tw:flex-none" aria-hidden="true" />
				Store the key securely. This is the only time it will be displayed.
			</div>
		</div>
	);
}

export default KeyCreatedPhase;
