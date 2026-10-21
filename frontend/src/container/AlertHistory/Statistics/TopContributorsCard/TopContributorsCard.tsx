import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { Button } from 'components/ui/button';
import history from 'lib/history';
import { ArrowRight } from 'lucide-react';

import TopContributorsContent from './TopContributorsContent';
import { TopContributorsCardProps } from './types';
import ViewAllDrawer from './ViewAllDrawer';

function TopContributorsCard({
	topContributorsData,
	totalCurrentTriggers,
}: TopContributorsCardProps): JSX.Element {
	const { search } = useLocation();
	const searchParams = useMemo(() => new URLSearchParams(search), [search]);

	const viewAllTopContributorsParam = searchParams.get('viewAllTopContributors');

	const [isViewAllVisible, setIsViewAllVisible] = useState(
		!!viewAllTopContributorsParam,
	);

	const toggleViewAllParam = (isOpen: boolean): void => {
		if (isOpen) {
			searchParams.set('viewAllTopContributors', 'true');
		} else {
			searchParams.delete('viewAllTopContributors');
		}
	};

	const toggleViewAllDrawer = (): void => {
		setIsViewAllVisible((prev) => {
			const newState = !prev;

			toggleViewAllParam(newState);

			return newState;
		});
		history.push({ search: searchParams.toString() });
	};

	return (
		<>
			<ContentPanel
				testId="top-contributors-card"
				title="Top contributors"
				divided
				actions={
					topContributorsData.length > 3 && (
						<Button
							variant="ghost"
							size="sm"
							onClick={toggleViewAllDrawer}
							data-testid="top-contributors-view-all"
						>
							View all
							<ArrowRight aria-hidden="true" />
						</Button>
					)
				}
			>
				<TopContributorsContent
					topContributorsData={topContributorsData}
					totalCurrentTriggers={totalCurrentTriggers}
				/>
			</ContentPanel>
			{isViewAllVisible && (
				<ViewAllDrawer
					isViewAllVisible={isViewAllVisible}
					toggleViewAllDrawer={toggleViewAllDrawer}
					totalCurrentTriggers={totalCurrentTriggers}
					topContributorsData={topContributorsData}
				/>
			)}
		</>
	);
}

export default TopContributorsCard;
