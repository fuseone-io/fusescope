import {
	ArrowUpRight,
	ChartLine,
	LucideIcon,
	ScrollText,
	Waypoints,
} from 'lucide-react';
import { DataSource } from 'types/common/queryBuilder';

const SIGNAL_ICONS: Record<DataSource, LucideIcon> = {
	[DataSource.METRICS]: ChartLine,
	[DataSource.TRACES]: Waypoints,
	[DataSource.LOGS]: ScrollText,
};

interface SampleAlertCardProps {
	header: string;
	subheader: string;
	dataSource: DataSource;
	link: string;
	onClick: () => void;
}

function SampleAlertCard({
	header,
	subheader,
	dataSource,
	link,
	onClick,
}: SampleAlertCardProps): JSX.Element {
	const Icon = SIGNAL_ICONS[dataSource];

	return (
		<a
			href={link}
			target="_blank"
			rel="noopener noreferrer"
			onClick={onClick}
			className="tw:group tw:flex tw:items-start tw:gap-3 tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised tw:p-4 tw:no-underline tw:transition-colors tw:outline-none tw:hover:border-primary/60 tw:focus-visible:ring-2 tw:focus-visible:ring-ring"
		>
			<span className="tw:flex tw:size-9 tw:flex-none tw:items-center tw:justify-center tw:rounded-md tw:bg-surface-sunken tw:text-primary-ink">
				<Icon aria-hidden="true" className="tw:size-4" />
			</span>
			<span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-0.5">
				<span className="tw:text-sm tw:font-medium tw:text-foreground">
					{header}
				</span>
				<span className="tw:text-[13px] tw:text-muted-foreground">{subheader}</span>
			</span>
			<ArrowUpRight
				aria-hidden="true"
				className="tw:size-4 tw:flex-none tw:text-subtle-foreground tw:transition-colors tw:group-hover:text-primary-ink"
			/>
		</a>
	);
}

export default SampleAlertCard;
