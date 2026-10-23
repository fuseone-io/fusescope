import TanStackTable from 'components/TanStackTableView';

import {
	EntityProgressBarType,
	getStrokeColor,
} from './EntityProgressBar.utils';
import UsageBar from './UsageBar';

export function EntityProgressBar({
	value,
	type,
	className,
}: {
	value: number;
	type: EntityProgressBarType;
	className?: string;
}): JSX.Element {
	const isNoData = value === -1 || Number.isNaN(+value);
	const percentage = isNoData ? null : Number((value * 100).toFixed(1));

	if (percentage === null) {
		return <TanStackTable.Text>-</TanStackTable.Text>;
	}

	return (
		<UsageBar
			percent={percentage}
			color={getStrokeColor(type, value)}
			className={className}
		/>
	);
}
