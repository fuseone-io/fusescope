import { ReactNode } from 'react';
import { Button } from 'components/ui/button';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from 'components/ui/tooltip';
import { PanelLeftOpen } from 'lucide-react';

import FilterIcon from '../FilterIcon';
import { IQuickFiltersConfig, QuickFiltersSource, SignalType } from '../types';
import useActiveFilterCounts from './useActiveFilterCounts';

interface QuickFiltersRailProps {
	source: QuickFiltersSource;
	signal?: SignalType;
	config?: IQuickFiltersConfig[];
	onShow: () => void;
}

function RailButton({
	label,
	onClick,
	testId,
	children,
}: {
	label: string;
	onClick: () => void;
	testId: string;
	children: ReactNode;
}): JSX.Element {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={label}
					data-testid={testId}
					className="tw:relative tw:text-muted-foreground tw:hover:text-primary"
					onClick={onClick}
				>
					{children}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="right">{label}</TooltipContent>
		</Tooltip>
	);
}

/** The collapsed filter pane: a restore button and one icon per filter section. */
function QuickFiltersRail({
	source,
	signal,
	config = [],
	onShow,
}: QuickFiltersRailProps): JSX.Element {
	const { filterConfig, counts } = useActiveFilterCounts({
		source,
		signal,
		config,
	});

	return (
		<aside
			aria-label="Filters"
			data-testid="quick-filters-rail"
			className="fs-ui tw:flex tw:w-10 tw:flex-none tw:flex-col tw:items-center tw:gap-1 tw:overflow-y-auto tw:border-r tw:border-border tw:bg-card tw:py-2 tw:font-sans"
		>
			<TooltipProvider delayDuration={300}>
				<RailButton
					label="Show filters"
					onClick={onShow}
					testId="quick-filters-rail-show"
				>
					<PanelLeftOpen />
				</RailButton>
				<span aria-hidden="true" className="tw:my-1 tw:h-px tw:w-6 tw:bg-border" />
				{filterConfig.map((filter) => {
					const count = counts[filter.attributeKey.key] ?? 0;
					return (
						<RailButton
							key={filter.attributeKey.key}
							label={count > 0 ? `${filter.title} (${count} active)` : filter.title}
							onClick={onShow}
							testId={`quick-filters-rail-${filter.attributeKey.key}`}
						>
							<FilterIcon
								attributeKey={filter.attributeKey.key}
								dataType={filter.attributeKey.dataType}
							/>
							{count > 0 && (
								<span className="tw:absolute tw:-top-0.5 tw:-right-0.5 tw:flex tw:h-4 tw:min-w-4 tw:items-center tw:justify-center tw:rounded-full tw:bg-primary tw:px-1 tw:text-[10px] tw:leading-none tw:font-semibold tw:text-primary-foreground tw:tabular-nums">
									{count}
								</span>
							)}
						</RailButton>
					);
				})}
			</TooltipProvider>
		</aside>
	);
}

QuickFiltersRail.defaultProps = {
	signal: undefined,
	config: [],
};

export default QuickFiltersRail;
