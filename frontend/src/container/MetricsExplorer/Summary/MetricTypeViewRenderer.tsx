import { MetrictypesTypeDTO } from 'api/generated/services/fuseScope.schemas';
import { BarChart, ChartBar, Diff, Gauge } from '@signozhq/icons';
import { cn } from 'lib/utils';

import { METRIC_TYPE_VIEW_LABEL_MAP } from './constants';

const TYPE_STYLES: Record<
	MetrictypesTypeDTO,
	{ icon: typeof Gauge; className: string }
> = {
	[MetrictypesTypeDTO.sum]: {
		icon: Diff,
		className: 'tw:bg-primary-soft tw:text-primary-ink',
	},
	[MetrictypesTypeDTO.gauge]: {
		icon: Gauge,
		className: 'tw:bg-brand-secondary-soft tw:text-brand-secondary-ink',
	},
	[MetrictypesTypeDTO.histogram]: {
		icon: BarChart,
		className: 'tw:bg-warning-soft tw:text-warning-ink',
	},
	[MetrictypesTypeDTO.summary]: {
		icon: ChartBar,
		className: 'tw:bg-success-soft tw:text-success-ink',
	},
	[MetrictypesTypeDTO.exponentialhistogram]: {
		icon: BarChart,
		className: 'tw:bg-muted tw:text-muted-foreground',
	},
};

export function MetricTypeViewRenderer({
	type,
}: {
	type: MetrictypesTypeDTO;
}): JSX.Element {
	const style = TYPE_STYLES[type];
	const Icon = style?.icon;

	return (
		<span
			className={cn(
				'metric-type-renderer fs-ui tw:inline-flex tw:h-5 tw:items-center tw:gap-1.5 tw:rounded-sm tw:px-2 tw:font-sans tw:text-xs tw:font-medium tw:whitespace-nowrap',
				style?.className ?? 'tw:bg-muted tw:text-muted-foreground',
			)}
		>
			{Icon && <Icon size={12} aria-hidden="true" />}
			{METRIC_TYPE_VIEW_LABEL_MAP[type] ?? type}
		</span>
	);
}

export default MetricTypeViewRenderer;
