import { fuseScopeDocsUrl } from 'constants/docs';

import MeterNote from './MeterNote';

const COST_METER_DOCS = fuseScopeDocsUrl(
	'/analyze/cost-meter/#turn-on-the-cost-meter',
);

interface MeterBillingNoteProps {
	onDismiss: () => void;
}

function MeterBillingNote({ onDismiss }: MeterBillingNoteProps): JSX.Element {
	return (
		<MeterNote tone="info" onDismiss={onDismiss} testId="meter-billing-note">
			Billing days run in UTC. To match a bill, pick whole UTC days: for Jan 1 in
			PT, that is Dec 31, 4:00 PM – Jan 1, 3:59 PM.{' '}
			<a
				href={COST_METER_DOCS}
				target="_blank"
				rel="noopener noreferrer"
				className="tw:font-medium tw:text-primary-ink tw:underline-offset-2 tw:hover:underline"
			>
				Learn more
			</a>
		</MeterNote>
	);
}

export default MeterBillingNote;
