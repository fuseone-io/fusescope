import { Inbox, SearchX } from 'lucide-react';

import InfraEmptyState from '../../components/InfraEmptyState';

interface EntityEmptyStateProps {
	hasFilters: boolean;
}

export default function EntityEmptyState({
	hasFilters,
}: EntityEmptyStateProps): JSX.Element {
	return hasFilters ? (
		<InfraEmptyState
			icon={<SearchX />}
			title="This query had no results."
			description="Edit your query and try again!"
		/>
	) : (
		<InfraEmptyState
			icon={<Inbox />}
			title="No data yet."
			description="When we receive data, it will show up here."
		/>
	);
}
