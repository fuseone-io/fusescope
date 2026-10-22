import type { RumtypesIngestCountsDTO } from 'api/generated/services/fuseScope.schemas';
import { formatCount } from 'lib/apm/format';

interface StatusCountsProps {
	counts: RumtypesIngestCountsDTO;
}

function StatusCounts({ counts }: StatusCountsProps): JSX.Element {
	const cells = [
		['Sessions', counts.sessions],
		['Views', counts.views],
		['Errors', counts.errors],
		['Web Vitals', counts.vitals],
	] as const;
	return (
		<div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(110px,1fr))] tw:gap-2">
			{cells.map(([label, value]) => (
				<div
					key={label}
					data-testid={`rum-status-${label.toLowerCase().replace(' ', '-')}`}
					className="tw:flex tw:flex-col tw:rounded-lg tw:bg-surface-sunken tw:px-3 tw:py-2"
				>
					<span className="tw:text-xs tw:text-subtle-foreground">{label}</span>
					<span className="tw:text-lg tw:font-semibold tw:tabular-nums">
						{formatCount(value)}
					</span>
				</div>
			))}
		</div>
	);
}

export default StatusCounts;
