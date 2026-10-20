import { cn } from 'lib/utils';

interface SparklineProps {
	values: number[];
	/** A `tw:stroke-*` class; the line is decorative next to its number. */
	strokeClassName?: string;
	className?: string;
	testId?: string;
}

const WIDTH = 64;
const HEIGHT = 22;
const INSET = 1;

export function sparklinePath(values: number[]): string {
	const max = Math.max(...values, 0) || 1;
	const last = Math.max(values.length - 1, 1);
	return values
		.map((value, index) => {
			const x = (index * WIDTH) / last;
			const y = HEIGHT - INSET - (Math.max(value, 0) / max) * (HEIGHT - 2 * INSET);
			return `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
		})
		.join(' ');
}

/** A tiny trend line for a table cell; nothing renders with fewer than two points. */
function Sparkline({
	values,
	strokeClassName = 'tw:stroke-series-1',
	className,
	testId = 'sparkline',
}: SparklineProps): JSX.Element {
	return (
		<svg
			aria-hidden="true"
			data-testid={testId}
			viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
			preserveAspectRatio="none"
			className={cn('tw:h-[22px] tw:w-14 tw:flex-none', className)}
		>
			{values.length > 1 && (
				<path
					d={sparklinePath(values)}
					fill="none"
					strokeWidth={1.5}
					strokeLinejoin="round"
					strokeLinecap="round"
					vectorEffect="non-scaling-stroke"
					className={strokeClassName}
				/>
			)}
		</svg>
	);
}

export default Sparkline;
