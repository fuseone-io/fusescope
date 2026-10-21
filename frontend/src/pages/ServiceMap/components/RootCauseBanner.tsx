import { Link } from 'react-router-dom';
import { Button } from 'components/ui/button';
import { formatPercent } from 'lib/apm/format';
import {
	ERROR_SPANS_FILTER,
	useTracesLink,
} from 'pages/MetricsApplication/hooks/useTracesLink';
import { ArrowRight, TriangleAlert } from 'lucide-react';

import { RootCause } from '../types';
import { describeRootCause } from '../utils/rootCause';

interface RootCauseBannerProps {
	causes: RootCause[];
	highlighted: boolean;
	onToggleHighlight: () => void;
	onSelect: (service: string) => void;
}

/** The deepest failing service and the failing calls leading to it; rule based. */
function RootCauseBanner({
	causes,
	highlighted,
	onToggleHighlight,
	onSelect,
}: RootCauseBannerProps): JSX.Element {
	const [cause, ...others] = causes;
	const tracesLink = useTracesLink(cause.service);
	return (
		<section
			aria-label="Likely root cause"
			data-testid="service-map-root-cause"
			className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:px-4 tw:py-3 tw:font-sans tw:text-foreground"
		>
			<span
				aria-hidden="true"
				className="tw:flex tw:size-8 tw:flex-none tw:items-center tw:justify-center tw:rounded-lg tw:bg-error-soft tw:text-error-ink"
			>
				<TriangleAlert className="tw:size-[18px]" />
			</span>
			<div className="tw:flex tw:min-w-0 tw:flex-[1_1_420px] tw:flex-col">
				<span className="tw:text-sm tw:font-semibold">
					<span className="translate-safe">
						{cause.path.length > 1
							? 'Errors are propagating along '
							: 'Errors originate at '}
					</span>
					<span className="tw:font-mono tw:text-[13px]">
						{cause.path.join(' → ')}
					</span>
				</span>
				<span className="tw:text-[13px] tw:text-muted-foreground">
					<button
						type="button"
						onClick={(): void => onSelect(cause.service)}
						className="tw:cursor-pointer tw:font-mono tw:text-xs tw:text-primary tw:hover:underline"
					>
						{cause.service}
					</button>{' '}
					<span className="translate-safe">{describeRootCause(cause)}</span>
				</span>
				{others.length > 0 && (
					<span className="tw:mt-0.5 tw:text-xs tw:text-muted-foreground">
						Also failing on their own:{' '}
						{others.map((other, index) => (
							<span key={other.service}>
								{index > 0 && <span className="translate-safe">, </span>}
								<button
									type="button"
									onClick={(): void => onSelect(other.service)}
									className="tw:cursor-pointer tw:font-mono tw:text-primary tw:hover:underline"
								>
									{other.service}
								</button>{' '}
								<span className="translate-safe">{formatPercent(other.errorRate)}</span>
							</span>
						))}
					</span>
				)}
			</div>
			<div className="tw:flex tw:flex-wrap tw:gap-2">
				{cause.path.length > 1 && (
					<Button
						variant="outline"
						size="sm"
						aria-pressed={highlighted}
						onClick={onToggleHighlight}
						data-testid="service-map-highlight-path"
					>
						<ArrowRight aria-hidden="true" />
						<span className="translate-safe">
							{highlighted ? 'Clear highlight' : 'Highlight path'}
						</span>
					</Button>
				)}
				<Button asChild size="sm">
					<Link
						to={tracesLink([ERROR_SPANS_FILTER])}
						data-testid="service-map-error-traces"
					>
						View error traces
					</Link>
				</Button>
			</div>
		</section>
	);
}

export default RootCauseBanner;
