import { ReactNode } from 'react';
import Spinner from 'components/Spinner';

export interface MetricItem {
	title: string;
	value: string | number;
}

interface FunnelMetricsTableProps {
	title: string;
	subtitle?: {
		label: string;
		value: string | number;
	};
	data: MetricItem[];
	isLoading?: boolean;
	isError?: boolean;
	emptyState?: JSX.Element;
}

function Message({ children }: { children: ReactNode }): JSX.Element {
	return (
		<p className="tw:m-0 tw:px-5 tw:py-8 tw:text-center tw:text-[13px] tw:text-muted-foreground">
			{children}
		</p>
	);
}

function FunnelMetricsContentRenderer({
	data,
	isLoading,
	isError,
	emptyState,
}: {
	data: MetricItem[];
	isLoading?: boolean;
	isError?: boolean;
	emptyState?: JSX.Element;
}): JSX.Element {
	if (isLoading) {
		return (
			<div className="tw:h-[84px]">
				<Spinner size="small" height="100%" />
			</div>
		);
	}
	if (data.length === 0) {
		return emptyState ?? <Message>No data</Message>;
	}

	if (isError) {
		return (
			<Message>
				Error fetching data. If the problem persists, please contact support.
			</Message>
		);
	}

	return (
		<div className="tw:grid tw:grid-cols-2 tw:md:grid-cols-4">
			{data.map((metric) => (
				<div
					key={metric.title}
					className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1 tw:border-r tw:border-border tw:px-5 tw:py-3.5 tw:last:border-r-0"
				>
					<span className="tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
						{metric.title}
					</span>
					<span className="tw:truncate tw:text-lg tw:font-semibold tw:tabular-nums">
						{metric.value}
					</span>
				</div>
			))}
		</div>
	);
}

function FunnelMetricsTable({
	title,
	subtitle,
	data,
	isLoading = false,
	isError = false,
	emptyState,
}: FunnelMetricsTableProps): JSX.Element {
	return (
		<section
			aria-label={title}
			className="fs-ui tw:flex tw:min-w-0 tw:flex-col tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised tw:font-sans tw:text-foreground"
		>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:border-b tw:border-border tw:px-5 tw:py-3.5">
				<h3 className="tw:m-0 tw:text-sm tw:font-semibold">{title}</h3>
				{subtitle && (
					<span className="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-[13px] tw:text-muted-foreground">
						{subtitle.label}
						<span aria-hidden="true" className="tw:text-subtle-foreground">
							⎯
						</span>
						<span className="tw:font-semibold tw:text-success tw:tabular-nums">
							{subtitle.value}
						</span>
					</span>
				)}
			</div>
			<FunnelMetricsContentRenderer
				data={data}
				isLoading={isLoading}
				emptyState={emptyState}
				isError={isError}
			/>
		</section>
	);
}

export default FunnelMetricsTable;
