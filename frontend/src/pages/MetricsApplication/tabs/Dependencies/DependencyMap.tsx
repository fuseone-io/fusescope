import { Link } from 'react-router-dom';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { Button } from 'components/ui/button';
import ROUTES from 'constants/routes';
import { Dependency } from 'lib/apm/dependencies';
import { SEVERE_ERROR_RATE } from 'lib/apm/highlights';
import { formatPercent, formatRate } from 'lib/apm/format';
import { cn } from 'lib/utils';
import { ArrowRight, MoveRight } from 'lucide-react';

import ServiceKindIcon from 'components/ServiceKindIcon/ServiceKindIcon';

import DependencyKindBadge from './DependencyKindBadge';
import { useDependencyKind } from './useDependencyKind';

interface DependencyMapProps {
	servicename: string;
	selfLine: string;
	upstream: Dependency[];
	downstream: Dependency[];
	linkFor: (dependency: Dependency) => string;
}

const WARNING_ERROR_RATE = 5;

function borderFor(errorRate: number): string {
	if (errorRate >= SEVERE_ERROR_RATE) {
		return 'tw:border-error';
	}
	return errorRate >= WARNING_ERROR_RATE
		? 'tw:border-warning'
		: 'tw:border-border';
}

function Node({
	dependency,
	href,
	showKind,
}: {
	dependency: Dependency;
	href: string;
	showKind: boolean;
}): JSX.Element {
	const kindOf = useDependencyKind();
	return (
		<Link
			to={href}
			data-testid="dependency-node"
			className={cn(
				'tw:flex tw:flex-col tw:gap-0.5 tw:rounded-lg tw:border tw:bg-surface-raised tw:px-3 tw:py-2 tw:no-underline tw:hover:bg-muted',
				borderFor(dependency.errorRate),
			)}
		>
			<span className="tw:flex tw:items-center tw:justify-between tw:gap-2">
				<span className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
					<ServiceKindIcon kind={kindOf(dependency)} />
					<span className="tw:truncate tw:font-mono tw:text-[13px] tw:font-medium tw:text-foreground">
						{dependency.name}
					</span>
				</span>
				{showKind && <DependencyKindBadge kind={dependency.kind} />}
			</span>
			<span className="tw:text-xs tw:text-muted-foreground tw:tabular-nums">
				{formatRate(dependency.rate)} ·{' '}
				<span
					className={cn(
						dependency.errorRate >= WARNING_ERROR_RATE && 'tw:text-error-ink',
					)}
				>
					{formatPercent(dependency.errorRate)} errors
				</span>
			</span>
		</Link>
	);
}

function Arrow({ failing }: { failing: boolean }): JSX.Element {
	return (
		<MoveRight
			aria-hidden="true"
			className={cn(
				'tw:mx-auto tw:size-6',
				failing ? 'tw:text-error' : 'tw:text-subtle-foreground',
			)}
		/>
	);
}

/** Callers → the service → what it calls, failing edges in red. */
function DependencyMap({
	servicename,
	selfLine,
	upstream,
	downstream,
	linkFor,
}: DependencyMapProps): JSX.Element {
	const fails = (items: Dependency[]): boolean =>
		items.some((item) => item.errorRate >= WARNING_ERROR_RATE);
	return (
		<ContentPanel
			testId="dependency-map"
			title="Map"
			subtitle="Direct callers and callees in the selected range, with request rate and error rate on each."
			actions={
				<Button asChild variant="ghost" size="sm">
					<Link to={ROUTES.SERVICE_MAP}>
						Open service map
						<ArrowRight aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<div className="fs-ui tw:grid tw:grid-cols-[minmax(0,1fr)_48px_minmax(0,0.8fr)_48px_minmax(0,1fr)] tw:items-center tw:gap-2 tw:px-5 tw:pt-2 tw:pb-6 tw:font-sans">
				<div className="tw:flex tw:flex-col tw:gap-2">
					<span className="tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
						Callers
					</span>
					{upstream.map((item) => (
						<Node
							key={item.name}
							dependency={item}
							href={linkFor(item)}
							showKind={false}
						/>
					))}
					{upstream.length === 0 && (
						<span className="tw:rounded-lg tw:border tw:border-dashed tw:border-border tw:px-3 tw:py-2.5 tw:text-xs tw:text-muted-foreground">
							No traced callers: <span className="tw:font-mono">{servicename}</span> is
							an entry point.
						</span>
					)}
				</div>
				<Arrow failing={fails(upstream)} />
				<div className="tw:flex tw:flex-col tw:items-center tw:gap-1 tw:rounded-[10px] tw:border-2 tw:border-primary tw:bg-primary-soft tw:px-3 tw:py-3.5">
					<span className="tw:font-mono tw:text-sm tw:font-semibold tw:text-primary-ink">
						{servicename}
					</span>
					<span className="tw:text-xs tw:text-muted-foreground tw:tabular-nums">
						{selfLine}
					</span>
				</div>
				<Arrow failing={fails(downstream)} />
				<div className="tw:flex tw:flex-col tw:gap-2">
					<span className="tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
						Calls
					</span>
					{downstream.map((item) => (
						<Node key={item.name} dependency={item} href={linkFor(item)} showKind />
					))}
					{downstream.length === 0 && (
						<span className="tw:rounded-lg tw:border tw:border-dashed tw:border-border tw:px-3 tw:py-2.5 tw:text-xs tw:text-muted-foreground">
							No calls to other services in this range.
						</span>
					)}
				</div>
			</div>
		</ContentPanel>
	);
}

export default DependencyMap;
