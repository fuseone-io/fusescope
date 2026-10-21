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

export interface ApdexCounts {
	/** Every request, failed ones included. */
	total: number;
	/** OK requests within T. */
	satisfied: number;
	/** OK requests within 4T but over T. */
	tolerating: number;
}

/** Failed requests count as frustrated: they are in the total only. */
export function apdexScore({
	total,
	satisfied,
	tolerating,
}: ApdexCounts): number | undefined {
	return total > 0 ? (satisfied + tolerating / 2) / total : undefined;
}

/** Requests up to the smallest bound at or above `ms`, as the Apdex chart reads `le`. */
function countAtOrAbove(buckets: LatencyBucket[], ms: number): number {
	const bucket = buckets.find((item) => item.le >= ms);
	return bucket?.cumulative ?? buckets[buckets.length - 1]?.cumulative ?? 0;
}

/**
 * Apdex at threshold T (ms) from the buckets of OK requests over all `total`
 * requests; T and 4T round up to the next bucket bound, as the chart does.
 */
export function apdexFromBuckets(
	okBuckets: LatencyBucket[],
	thresholdMs: number,
	total: number,
): number | undefined {
	const satisfied = countAtOrAbove(okBuckets, thresholdMs);
	return apdexScore({
		total,
		satisfied,
		tolerating: countAtOrAbove(okBuckets, thresholdMs * 4) - satisfied,
	});
}
