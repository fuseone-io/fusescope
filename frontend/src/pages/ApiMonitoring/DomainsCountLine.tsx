import { useDomainList } from 'container/ApiMonitoring/Explorer/Domains/List/useDomainList';

/** A domain fails most calls from this error share on. */
const FAILING_SHARE = 50;

/** How many domains the range has, and how many of them fail most calls. */
function DomainsCountLine(): JSX.Element | null {
	const { rows, isLoading, isFetching } = useDomainList();
	if (isLoading || isFetching || rows.length === 0) {
		return null;
	}
	const failing = rows.filter(
		(row) => (row.errorRate ?? 0) >= FAILING_SHARE,
	).length;
	return (
		<>
			<span className="tw:text-foreground">{rows.length}</span>{' '}
			{rows.length === 1 ? 'domain' : 'domains'} called from client spans
			{failing > 0 && (
				<>
					{' — '}
					<span className="tw:text-error-ink">{failing}</span> failing most calls
				</>
			)}
		</>
	);
}

export default DomainsCountLine;
