import { useMemo, useState } from 'react';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { ApmWindow } from 'lib/apm/window';
import { plural } from 'lib/rum/format';

import RouteSheet from './components/RouteSheet';
import RoutesTable from './components/RoutesTable';
import UnknownLoadsHint from './components/UnknownLoadsHint';
import { DEFAULT_SORT, ROUTES_LIMIT } from './constants';
import { useRouteParam } from './hooks/useRouteParam';
import { useViewsQuery } from './hooks/useViewsQuery';
import { ViewSort } from './types';
import { sortViewRows, unknownLoadsTotal } from './utils';

interface ViewsTabProps {
	applicationId: string;
	release: string;
	window: ApmWindow;
}

const SORT_LABELS: Record<ViewSort['key'], string> = {
	route: 'route',
	views: 'views',
	pageLoads: 'page loads',
	routeChanges: 'route changes',
	lcp: 'LCP p75',
	inp: 'INP p75',
	cls: 'CLS p75',
	timeOnView: 'time on view',
	errors: 'errors',
	slowest: 'slowest request',
};

function emptyText(status: string, rows: number): string | undefined {
	if (status === 'loading') {
		return 'Loading routes…';
	}
	if (status === 'error') {
		return 'Routes could not be loaded.';
	}
	return rows === 0 ? 'No views in this range.' : undefined;
}

function ViewsTab({
	applicationId,
	release,
	window,
}: ViewsTabProps): JSX.Element {
	const state = useViewsQuery(applicationId, window, release);
	const [sort, setSort] = useState<ViewSort>(DEFAULT_SORT);
	const [route, setRoute] = useRouteParam();
	const rows = useMemo(
		() => (state.status === 'ready' ? sortViewRows(state.rows, sort) : []),
		[state, sort],
	);
	const unknown = unknownLoadsTotal(rows);
	const count = `${rows.length}${rows.length >= ROUTES_LIMIT ? '+' : ''}`;

	return (
		<div data-testid="rum-views" className="tw:flex tw:flex-col tw:gap-4">
			<ContentPanel
				testId="rum-views-routes"
				title="Routes"
				subtitle="One row per route template. Vitals come from page loads only; route changes add time on view, errors and requests."
				actions={
					state.status === 'ready' && (
						<span className="tw:text-xs tw:text-muted-foreground tw:tabular-nums">
							{count} {plural(rows.length, 'route')} · sorted by{' '}
							{SORT_LABELS[sort.key]}
						</span>
					)
				}
				footer={
					<span className="tw:flex tw:w-full tw:flex-wrap tw:justify-between tw:gap-2">
						<span>
							Bars split page loads into good, needs improvement and poor. Select a
							route for its detail.
						</span>
						<span>LCP good ≤ 2.5 s · INP good ≤ 200 ms · CLS good ≤ 0.1</span>
					</span>
				}
				divided
			>
				{unknown > 0 && <UnknownLoadsHint views={unknown} />}
				<RoutesTable
					rows={rows}
					sort={sort}
					onSort={setSort}
					selected={route}
					onOpen={setRoute}
					empty={emptyText(state.status, rows.length)}
				/>
			</ContentPanel>
			<RouteSheet
				applicationId={applicationId}
				route={route}
				release={release}
				window={window}
				onClose={(): void => setRoute('')}
			/>
		</div>
	);
}

export default ViewsTab;
