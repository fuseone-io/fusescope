import { SearchX } from 'lucide-react';

import StateCard from '../StateCard';

interface Props {
	title: string;
	description?: string;
}

function NoResultsState({ title, description }: Props): JSX.Element {
	return (
		<StateCard
			testId="dashboards-no-results"
			tone="neutral"
			icon={<SearchX />}
			title={title}
			description={description}
		/>
	);
}

export default NoResultsState;
