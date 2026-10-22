import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { VitalName } from 'lib/rum/types';
import { rateVital, VITAL_TITLES, vitalThresholdsText } from 'lib/rum/vitals';

import { RATING_LABELS, RATING_TONES } from './constants';

interface RatingChipProps {
	vital: VitalName;
	value: number;
	testId?: string;
}

/** Good / Needs work / Poor for a vital's p75. */
function RatingChip({
	vital,
	value,
	testId,
}: RatingChipProps): JSX.Element | null {
	const rating = rateVital(vital, value);
	if (!rating) {
		return null;
	}
	return (
		<span
			title={`${VITAL_TITLES[vital]} — ${vitalThresholdsText(vital)}`}
			className="tw:inline-flex"
		>
			<StatusBadge tone={RATING_TONES[rating]} dot testId={testId}>
				{RATING_LABELS[rating]}
			</StatusBadge>
		</span>
	);
}

export default RatingChip;
