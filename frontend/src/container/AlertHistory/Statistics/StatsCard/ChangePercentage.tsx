import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

type ChangePercentageProps = {
	percentage: number;
	direction: number;
	duration: string | null;
};

function ChangePercentage({
	percentage,
	direction,
	duration,
}: ChangePercentageProps): JSX.Element {
	if (direction === 0) {
		return (
			<StatusBadge tone="neutral" testId="stats-card-change">
				no previous data
			</StatusBadge>
		);
	}

	const Icon = direction > 0 ? ArrowDownLeft : ArrowUpRight;
	return (
		<StatusBadge
			tone={direction > 0 ? 'success' : 'error'}
			testId="stats-card-change"
		>
			<Icon aria-hidden="true" className="tw:-ml-0.5 tw:size-3.5" />
			{percentage}% vs Last {duration}
		</StatusBadge>
	);
}

export default ChangePercentage;
