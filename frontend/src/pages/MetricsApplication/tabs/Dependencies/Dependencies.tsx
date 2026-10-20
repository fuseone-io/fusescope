import { useServiceDependencies } from 'container/MetricsApplication/hooks/useServiceDependencies';
import { useServiceKpis } from 'container/MetricsApplication/hooks/useServiceKpis';
import { formatPercent, formatRate } from 'lib/apm/format';

import DependencyMap from './DependencyMap';
import DependencyTable from './DependencyTable';
import { useDependencyLink } from './useDependencyLink';

interface DependenciesProps {
	servicename: string;
}

/** What calls the service and what it calls, from the dependency graph and span metrics. */
function Dependencies({ servicename }: DependenciesProps): JSX.Element {
	const { upstream, downstream, isLoading } =
		useServiceDependencies(servicename);
	const { current } = useServiceKpis(servicename);
	const linkFor = useDependencyLink(servicename);
	const selfLine = current
		? `${formatRate(current.rate)} · ${formatPercent(current.errorRate)} errors`
		: '';
	const mono = (text: string): JSX.Element => (
		<span className="tw:font-mono">{text}</span>
	);

	return (
		<div className="tw:flex tw:flex-col tw:gap-4">
			<DependencyMap
				servicename={servicename}
				selfLine={selfLine}
				upstream={upstream}
				downstream={downstream}
				linkFor={linkFor}
			/>
			<DependencyTable
				testId="dependencies-downstream"
				title="Downstream"
				subtitle={
					<>
						Services, databases and external addresses that {mono(servicename)} calls
					</>
				}
				nameLabel="Dependency"
				rows={downstream}
				isLoading={isLoading}
				linkFor={linkFor}
				empty={
					<span className="tw:text-[13px] tw:text-muted-foreground">
						{mono(servicename)} made no traced calls in this range.
					</span>
				}
			/>
			<DependencyTable
				testId="dependencies-upstream"
				title="Upstream"
				subtitle={<>Traced services that call {mono(servicename)}</>}
				nameLabel="Caller"
				rows={upstream}
				isLoading={isLoading}
				linkFor={linkFor}
				empty={
					<span className="tw:flex tw:flex-col tw:items-center tw:gap-1.5">
						<span className="tw:text-[13px] tw:font-medium">
							No traced callers in this range
						</span>
						<span className="tw:max-w-[520px] tw:text-[13px] tw:text-muted-foreground">
							{mono(servicename)} receives requests from clients that send no trace
							context, such as browsers. Its request rate is on the Overview tab.
						</span>
					</span>
				}
			/>
		</div>
	);
}

export default Dependencies;
