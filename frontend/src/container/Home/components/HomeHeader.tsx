import CompactPageHeader from 'components/PageTemplate/components/CompactPageHeader';
import { House } from 'lucide-react';
import { useAppContext } from 'providers/App/App';

import { homeTitle, IngestingSignals, receivingSummary } from '../utils';
import ListeningIndicator from './HomeOnboarding/ListeningIndicator';
import WorkspaceUrl from './WorkspaceUrl';

interface HomeHeaderProps {
	signals: IngestingSignals;
	isLoading: boolean;
}

function HomeHeader({ signals, isLoading }: HomeHeaderProps): JSX.Element {
	const { user } = useAppContext();
	const receiving = signals.logs || signals.traces || signals.metrics;

	return (
		<CompactPageHeader
			testId="home-header"
			icon={<House />}
			title={homeTitle(user?.displayName, receiving)}
			meta={isLoading ? undefined : receivingSummary(signals)}
			actions={
				<>
					{!isLoading && !receiving && <ListeningIndicator />}
					<WorkspaceUrl />
				</>
			}
		/>
	);
}

export default HomeHeader;
