import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { Skeleton } from 'components/ui/skeleton';
import { formatCount } from 'lib/apm/format';
import { LatencyBucket, percentileBucket } from 'lib/apm/histogram';
import { cn } from 'lib/utils';

interface LatencyDistributionProps {
	buckets: LatencyBucket[];
	isLoading: boolean;
}

function compactCount(count: number): string {
	if (count >= 1_000_000) {
		return `${Number((count / 1_000_000).toPrecision(2))}M`;
	}
	if (count >= 1000) {
		return `${Number((count / 1000).toPrecision(2))}k`;
	}
	return String(Math.round(count));
}

/** Requests per `signoz_latency` bucket (ms) over the range, with p50 and p99 marked. */
function LatencyDistribution({
	buckets: allBuckets,
	isLoading,
}: LatencyDistributionProps): JSX.Element {
	const firstUsed = allBuckets.findIndex((bucket) => bucket.count > 0);
	const buckets = firstUsed > 0 ? allBuckets.slice(firstUsed) : allBuckets;
	const max = Math.max(...buckets.map((bucket) => bucket.count), 1);
	const p50 = percentileBucket(buckets, 50);
	const p99 = percentileBucket(buckets, 99);
	const tag = (index: number): string | null => {
		if (index === p99 && index === p50) {
			return 'p50 · p99';
		}
		if (index === p50) {
			return 'p50';
		}
		return index === p99 ? 'p99' : null;
	};

	return (
		<ContentPanel
			testId="service-latency-distribution"
			title="Latency distribution"
			subtitle="Requests by duration bucket (ms) over the selected range"
			actions={
				<ul className="tw:m-0 tw:flex tw:list-none tw:gap-3.5 tw:p-0 tw:text-xs tw:text-muted-foreground">
					<li className="tw:flex tw:items-center tw:gap-1.5">
						<span
							aria-hidden="true"
							className="tw:size-2 tw:rounded-[2px] tw:bg-series-1"
						/>
						requests
					</li>
					<li className="tw:flex tw:items-center tw:gap-1.5">
						<span
							aria-hidden="true"
							className="tw:size-2 tw:rounded-[2px] tw:bg-series-2"
						/>
						at or above p99
					</li>
				</ul>
			}
			className="tw:flex-[2_1_560px]"
		>
			<div className="fs-ui tw:px-5 tw:pt-2 tw:pb-4 tw:font-sans">
				{isLoading && <Skeleton className="tw:h-[200px] tw:bg-muted" />}
				{!isLoading && buckets.length === 0 && (
					<p className="tw:py-16 tw:text-center tw:text-[13px] tw:text-muted-foreground">
						No latency buckets for this service in the range.
					</p>
				)}
				{!isLoading && buckets.length > 0 && (
					<figure
						className="tw:m-0"
						aria-label={`Requests by latency bucket; p50 in ${buckets[p50]?.label ?? '—'} ms, p99 in ${buckets[p99]?.label ?? '—'} ms`}
					>
						<div className="tw:flex tw:h-[180px] tw:items-end tw:gap-1.5 tw:border-b tw:border-border">
							{buckets.map((bucket, index) => (
								<div
									key={bucket.label}
									data-testid="latency-bucket"
									title={`${formatCount(bucket.count)} requests in ${bucket.label} ms`}
									className="tw:flex tw:h-full tw:min-w-0 tw:flex-1 tw:flex-col tw:items-center tw:justify-end tw:gap-1"
								>
									{tag(index) && (
										<span
											data-testid="latency-marker"
											className="tw:rounded-sm tw:bg-surface-sunken tw:px-1.5 tw:text-[11px] tw:font-medium tw:whitespace-nowrap"
										>
											{tag(index)}
										</span>
									)}
									<span className="tw:text-[11px] tw:text-muted-foreground tw:tabular-nums">
										{bucket.count > 0 ? compactCount(bucket.count) : ''}
									</span>
									<div
										className={cn(
											'tw:min-h-0.5 tw:w-full tw:rounded-t',
											p99 >= 0 && index >= p99 ? 'tw:bg-series-2' : 'tw:bg-series-1',
										)}
										style={{ height: `${(bucket.count / max) * 70}%` }}
									/>
								</div>
							))}
						</div>
						<div className="tw:flex tw:gap-1.5 tw:pt-1.5">
							{buckets.map((bucket) => (
								<span
									key={bucket.label}
									className="tw:min-w-0 tw:flex-1 tw:truncate tw:text-center tw:text-[11px] tw:text-subtle-foreground tw:tabular-nums"
								>
									{bucket.label}
								</span>
							))}
						</div>
					</figure>
				)}
			</div>
		</ContentPanel>
	);
}

export default LatencyDistribution;
