export interface CumulativeBucket {
	/** Upper bound in ms as the metric labels it, `+Inf` for the last. */
	le: string;
	count: number;
}

export interface LatencyBucket {
	le: number;
	label: string;
	/** Requests in this bucket only. */
	count: number;
	/** Requests up to this bucket's bound. */
	cumulative: number;
}

const formatBound = (ms: number): string =>
	ms >= 1000 ? `${Number((ms / 1000).toPrecision(3))}k` : String(ms);

/**
 * `signoz_latency.bucket` counts by `le` (cumulative) as one bar per bucket,
 * trimmed after the last bucket with requests.
 */
export function latencyBuckets(
	cumulative: CumulativeBucket[],
): LatencyBucket[] {
	const sorted = cumulative
		.map((bucket) => ({
			le: bucket.le === '+Inf' ? Infinity : Number(bucket.le),
			total: Number.isFinite(bucket.count) ? bucket.count : 0,
		}))
		.filter((bucket) => !Number.isNaN(bucket.le))
		.sort((a, b) => a.le - b.le);

	let running = 0;
	const buckets = sorted.map((bucket, index) => {
		const total = Math.max(bucket.total, running);
		const count = total - running;
		running = total;
		const previous = sorted[index - 1]?.le;
		let label = formatBound(bucket.le);
		if (index === 0) {
			label = `≤${label}`;
		} else if (bucket.le === Infinity) {
			label = `>${formatBound(previous)}`;
		}
		return { le: bucket.le, label, count, cumulative: total };
	});

	let last = buckets.length - 1;
	while (last >= 0 && buckets[last].count === 0) {
		last -= 1;
	}
	return buckets.slice(0, last + 1);
}

/** Index of the bucket holding the given percentile, -1 without requests. */
export function percentileBucket(
	buckets: LatencyBucket[],
	percentile: number,
): number {
	const total = buckets[buckets.length - 1]?.cumulative ?? 0;
	if (total <= 0) {
		return -1;
	}
	return buckets.findIndex(
		(bucket) => bucket.cumulative >= (total * percentile) / 100,
	);
}

/** Requests up to the largest bound at or below `ms`. */
function countUpTo(buckets: LatencyBucket[], ms: number): number {
	return buckets
		.filter((bucket) => bucket.le <= ms)
		.reduce((highest, bucket) => Math.max(highest, bucket.cumulative), 0);
}

/** Apdex at threshold T (ms), read off bucket bounds: satisfied ≤ T, tolerating ≤ 4T. */
export function apdexFromBuckets(
	buckets: LatencyBucket[],
	thresholdMs: number,
): number | undefined {
	const total = buckets[buckets.length - 1]?.cumulative ?? 0;
	if (total <= 0) {
		return undefined;
	}
	const satisfied = countUpTo(buckets, thresholdMs);
	const tolerating = countUpTo(buckets, thresholdMs * 4) - satisfied;
	return (satisfied + tolerating / 2) / total;
}
