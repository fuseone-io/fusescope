import { useLocation } from 'react-router-dom';
import { Button } from 'components/ui/button';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { DomainRow, domainNeighbours, sortDomains } from '../../../domainList';
import { domainPath, domainSearch } from '../../../domainRoute';

interface DomainNavigationProps {
	domain: string;
	/** The list's domains; neighbours follow its default order. */
	rows: DomainRow[];
}

/** Previous and next domain in the order the list shows them. */
function DomainNavigation({
	domain,
	rows,
}: DomainNavigationProps): JSX.Element {
	const { search } = useLocation();
	const { safeNavigate } = useSafeNavigate();
	const ordered = sortDomains(rows, { key: 'errorRate', direction: 'desc' }).map(
		(row) => row.domain,
	);
	const { previous, next } = domainNeighbours(ordered, domain);
	const go = (target: string | undefined) => (): void => {
		if (target) {
			safeNavigate(domainPath(target, domainSearch(search)));
		}
	};

	return (
		<div className="tw:inline-flex" role="group" aria-label="Domain navigation">
			<Button
				type="button"
				variant="outline"
				size="icon-sm"
				disabled={!previous}
				onClick={go(previous)}
				aria-label={previous ? `Previous domain: ${previous}` : 'Previous domain'}
				title={previous ? `Previous domain: ${previous}` : 'Previous domain'}
				data-testid="domain-previous"
				className="tw:rounded-r-none"
			>
				<ChevronLeft />
			</Button>
			<Button
				type="button"
				variant="outline"
				size="icon-sm"
				disabled={!next}
				onClick={go(next)}
				aria-label={next ? `Next domain: ${next}` : 'Next domain'}
				title={next ? `Next domain: ${next}` : 'Next domain'}
				data-testid="domain-next"
				className="tw:-ml-px tw:rounded-l-none"
			>
				<ChevronRight />
			</Button>
		</div>
	);
}

export default DomainNavigation;
