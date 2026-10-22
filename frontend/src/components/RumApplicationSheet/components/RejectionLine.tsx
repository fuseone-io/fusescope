import type { RumtypesIngestRejectionDTO } from 'api/generated/services/fuseScope.schemas';
import { RumtypesRejectionReasonDTO } from 'api/generated/services/fuseScope.schemas';
import { Button } from 'components/ui/button';
import { formatCount } from 'lib/apm/format';
import { TriangleAlert } from 'lucide-react';

interface RejectionLineProps {
	rejection: RumtypesIngestRejectionDTO;
	onAddOrigin?: (origin: string) => void;
}

const REASONS: Record<RumtypesRejectionReasonDTO, string> = {
	[RumtypesRejectionReasonDTO.bad_key]:
		'the key is not valid for this application',
	[RumtypesRejectionReasonDTO.origin_not_allowed]: 'origin not allowed',
	[RumtypesRejectionReasonDTO.rate_limited]: 'rate limited',
	[RumtypesRejectionReasonDTO.too_large]: 'payload too large',
	[RumtypesRejectionReasonDTO.invalid_payload]: 'not valid OTLP',
};

function RejectionLine({
	rejection,
	onAddOrigin,
}: RejectionLineProps): JSX.Element {
	const requests = `${formatCount(rejection.count)} ${rejection.count === 1 ? 'request' : 'requests'} rejected`;
	const origin = rejection.lastOrigin;
	const isOrigin =
		rejection.reason === RumtypesRejectionReasonDTO.origin_not_allowed && origin;

	return (
		<span
			data-testid="rum-rejection"
			className="tw:flex tw:items-start tw:gap-2 tw:text-[13px]"
		>
			<span className="tw:mt-0.5 tw:flex tw:size-[18px] tw:flex-none tw:items-center tw:justify-center tw:rounded-full tw:bg-warning-soft tw:text-warning-ink">
				<TriangleAlert aria-hidden="true" className="tw:size-3" />
			</span>
			<span className="tw:flex tw:flex-wrap tw:items-center tw:gap-x-1.5">
				{isOrigin ? (
					<>
						{requests}: origin <span className="tw:font-mono">{origin}</span> is not
						allowed.
						{onAddOrigin && (
							<Button
								variant="link"
								size="xs"
								className="tw:h-auto tw:px-0"
								data-testid="rum-rejection-add-origin"
								onClick={(): void => onAddOrigin(origin)}
							>
								Add origin
							</Button>
						)}
					</>
				) : (
					`${requests}: ${REASONS[rejection.reason] ?? rejection.reason}.`
				)}
			</span>
		</span>
	);
}

export default RejectionLine;
