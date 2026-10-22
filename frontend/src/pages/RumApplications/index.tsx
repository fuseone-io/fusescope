import { useMemo, useState } from 'react';
import CompactPageHeader from 'components/PageTemplate/components/CompactPageHeader';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import HeaderBandLayout from 'components/PageTemplate/components/HeaderBandLayout';
import RumApplicationSheet from 'components/RumApplicationSheet/RumApplicationSheet';
import { SheetTarget } from 'components/RumApplicationSheet/types';
import { Button } from 'components/ui/button';
import { formatCount } from 'lib/apm/format';
import { useCanManageRum } from 'lib/rum/useCanManageRum';
import { AppWindow, BookOpen, Plus } from 'lucide-react';

import ApplicationsEmptyState from './components/ApplicationsEmptyState';
import ApplicationsKpis from './components/ApplicationsKpis';
import ApplicationsTable from './components/ApplicationsTable';
import ApplicationsToolbar from './components/ApplicationsToolbar';
import ApplicationsUnavailable from './components/ApplicationsUnavailable';
import { SDK_DOCS_URL } from './constants';
import { useApplicationsList } from './hooks/useApplicationsList';
import { ApplicationFilters } from './types';
import { applicationsKpis, environmentsOf, filterApplications } from './utils';

const NO_FILTERS: ApplicationFilters = {
	search: '',
	platform: 'all',
	environment: '',
};

function RumApplications(): JSX.Element {
	const state = useApplicationsList();
	const canManage = useCanManageRum();
	const [filters, setFilters] = useState(NO_FILTERS);
	const [sheet, setSheet] = useState<SheetTarget | null>(null);

	const rows = useMemo(
		() => (state.status === 'ready' ? state.rows : []),
		[state],
	);
	const kpis = useMemo(() => applicationsKpis(rows), [rows]);
	const shown = useMemo(
		() => filterApplications(rows, filters),
		[rows, filters],
	);
	const openNew = (): void => setSheet({ mode: 'new' });

	let body: JSX.Element;
	if (state.status === 'error') {
		body = <ApplicationsUnavailable forbidden={state.forbidden} />;
	} else if (state.status === 'ready' && rows.length === 0) {
		body = <ApplicationsEmptyState canManage={canManage} onCreate={openNew} />;
	} else {
		body = (
			<div className="tw:flex tw:flex-col tw:gap-4 tw:px-4 tw:pt-4 tw:pb-8 tw:md:px-6">
				<ApplicationsKpis kpis={kpis} />
				<ApplicationsToolbar
					filters={filters}
					environments={environmentsOf(rows)}
					onChange={setFilters}
				/>
				<ContentPanel
					testId="rum-applications-table"
					title="Applications"
					subtitle="Web Vitals are the 75th percentile of page loads. Error rate is the share of sessions with at least one error."
					divided
					footer={
						<span className="tw:flex tw:w-full tw:flex-wrap tw:justify-between tw:gap-2">
							<span className="tw:tabular-nums">
								{shown.length} of {rows.length} applications
							</span>
							<span>
								Supported SDK: <span className="tw:font-mono">@fusescope/browser</span>{' '}
								· any OTLP client is accepted
							</span>
						</span>
					}
				>
					<div className="tw:overflow-x-auto">
						<ApplicationsTable
							rows={shown}
							metricsLoading={state.status === 'loading'}
							onOpenSettings={(applicationId): void =>
								setSheet({ mode: 'edit', applicationId })
							}
						/>
					</div>
					{state.status === 'ready' && shown.length === 0 && (
						<p
							data-testid="rum-applications-no-match"
							className="fs-ui tw:px-5 tw:py-10 tw:text-center tw:text-[13px] tw:text-muted-foreground"
						>
							No applications match the filters.
						</p>
					)}
				</ContentPanel>
			</div>
		);
	}

	return (
		<HeaderBandLayout
			testId="rum-applications-page"
			header={
				<CompactPageHeader
					icon={<AppWindow />}
					title="Applications"
					meta={
						state.status === 'ready' &&
						rows.length > 0 && (
							<>
								<strong className="tw:font-medium tw:text-foreground">
									{rows.length}
								</strong>{' '}
								applications ·{' '}
								<strong
									data-testid="rum-applications-sessions"
									className="tw:font-medium tw:text-foreground"
								>
									{formatCount(kpis.sessions)}
								</strong>{' '}
								sessions in the selected range
							</>
						)
					}
					actions={
						<>
							<Button asChild variant="ghost">
								<a
									href={SDK_DOCS_URL}
									target="_blank"
									rel="noreferrer"
									className="tw:text-foreground!"
								>
									<BookOpen aria-hidden="true" />
									SDK docs
								</a>
							</Button>
							{canManage && (
								<Button onClick={openNew} data-testid="rum-applications-new">
									<Plus aria-hidden="true" />
									New application
								</Button>
							)}
						</>
					}
				/>
			}
		>
			{body}
			<RumApplicationSheet target={sheet} onClose={(): void => setSheet(null)} />
		</HeaderBandLayout>
	);
}

export default RumApplications;
