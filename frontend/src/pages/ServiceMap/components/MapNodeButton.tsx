import ServiceKindIcon from 'components/ServiceKindIcon/ServiceKindIcon';
import { formatPercent, formatRate } from 'lib/apm/format';
import { cn } from 'lib/utils';

import { RING_CLASS } from '../constants';
import { MapNode, RingTone } from '../types';
import { nodeAriaLabel, languageBadge } from '../utils/format';
import { HEALTH_LABEL, nodeHealth } from '../utils/health';
import { Point } from '../utils/layout';

interface MapNodeButtonProps {
	node: MapNode;
	position: Point;
	size: number;
	tone: RingTone;
	selected: boolean;
	dimmed: boolean;
	onSelect: (id: string) => void;
	onHover: (id: string | null) => void;
}

/** A node: kind icon in a ring coloured by the mode, language, name and traffic. */
function MapNodeButton({
	node,
	position,
	size,
	tone,
	selected,
	dimmed,
	onSelect,
	onHover,
}: MapNodeButtonProps): JSX.Element {
	const health = nodeHealth(node.errorRate, node.p99);
	const badge = node.inferred ? undefined : languageBadge(node.language);
	return (
		<button
			type="button"
			data-testid="service-map-node"
			data-node-id={node.id}
			aria-pressed={selected}
			aria-label={nodeAriaLabel(node, HEALTH_LABEL[health])}
			onClick={(): void => onSelect(node.id)}
			onMouseEnter={(): void => onHover(node.id)}
			onMouseLeave={(): void => onHover(null)}
			onFocus={(): void => onHover(node.id)}
			onBlur={(): void => onHover(null)}
			style={{
				left: position.x,
				top: position.y,
				transform: `translate(-50%, -${size / 2}px)`,
			}}
			className={cn(
				'tw:group tw:pointer-events-auto tw:absolute tw:flex tw:w-[140px] tw:cursor-pointer tw:flex-col tw:items-center tw:gap-[3px] tw:rounded-md tw:border-0 tw:bg-transparent tw:p-0 tw:font-sans tw:text-foreground tw:transition-opacity tw:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-ring',
				dimmed && 'tw:opacity-30',
			)}
		>
			<span
				style={{ width: size, height: size }}
				className={cn(
					'tw:relative tw:flex tw:flex-none tw:items-center tw:justify-center tw:border-[2.5px] tw:bg-surface-raised tw:shadow-[0_0_0_4px_var(--fs-background)]',
					node.inferred ? 'tw:rounded-[11px] tw:border-dashed' : 'tw:rounded-full',
					RING_CLASS[tone],
					selected &&
						'tw:shadow-[0_0_0_3px_var(--fs-background),0_0_0_5px_var(--fs-primary)]',
				)}
			>
				{health === 'critical' && tone === 'error' && (
					<span
						aria-hidden="true"
						className={cn(
							'tw:absolute tw:-inset-[3px] tw:border-2 tw:border-error tw:opacity-60 tw:motion-safe:animate-ping',
							node.inferred ? 'tw:rounded-[11px]' : 'tw:rounded-full',
						)}
					/>
				)}
				<ServiceKindIcon
					kind={node.kind}
					className={node.inferred ? undefined : 'tw:rounded-full'}
				/>
				{badge && (
					<span className="tw:absolute tw:-right-2.5 tw:-bottom-1.5 tw:rounded-[4px] tw:border tw:border-border tw:bg-surface-raised tw:px-1 tw:font-mono tw:text-[9.5px] tw:leading-[14px] tw:font-semibold tw:text-foreground">
						{badge}
					</span>
				)}
			</span>
			<span
				className={cn(
					'tw:mt-0.5 tw:max-w-full tw:truncate tw:rounded tw:bg-background tw:px-1.5 tw:font-mono tw:text-xs tw:leading-[1.35] tw:font-medium tw:group-hover:text-primary',
					selected &&
						'tw:bg-primary tw:text-primary-foreground tw:group-hover:text-primary-foreground',
				)}
			>
				{node.id}
			</span>
			<span className="tw:rounded-[3px] tw:bg-background tw:px-1 tw:text-[10.5px] tw:leading-tight tw:whitespace-nowrap tw:text-subtle-foreground tw:tabular-nums">
				{formatRate(node.rate)} ·{' '}
				<span className={cn(node.errorRate >= 1 && 'tw:text-error')}>
					{formatPercent(node.errorRate)}
				</span>
			</span>
		</button>
	);
}

export default MapNodeButton;
