import { ReactNode } from 'react';

import InfraSearchField from '../components/InfraSearchField';

interface EntityTabToolbarProps {
	/** The tab's `QuerySearch`; drawn as a search field. */
	search?: ReactNode;
	/** Before the search, e.g. the locked scope of an overview. */
	prefix?: ReactNode;
	time: ReactNode;
	run?: ReactNode;
}

/** One row above a detail tab: search, the tab's own time range and Run query. */
function EntityTabToolbar({
	search,
	prefix,
	time,
	run,
}: EntityTabToolbarProps): JSX.Element {
	return (
		<div
			className="tw:flex tw:flex-wrap tw:items-start tw:gap-2 tw:[&_[data-run-query-btn]]:h-10"
			data-testid="entity-tab-toolbar"
		>
			{search ? (
				<InfraSearchField className="tw:basis-[300px]">
					{prefix}
					{search}
				</InfraSearchField>
			) : (
				<div className="tw:flex-1" />
			)}
			<div className="tw:ml-auto tw:flex tw:min-h-10 tw:items-center tw:gap-2">
				{time}
				{run}
			</div>
		</div>
	);
}

export default EntityTabToolbar;
