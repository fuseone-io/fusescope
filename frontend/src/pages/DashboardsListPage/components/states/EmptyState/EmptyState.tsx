import { ReactNode } from 'react';
import { Button } from 'components/ui/button';
import { ArrowUpRight, LayoutGrid } from 'lucide-react';
import logEvent from 'api/common/logEvent';
import { fuseScopeDocsUrl } from 'constants/docs';
import { openInNewTab } from 'utils/navigation';

import StateCard from '../StateCard';

interface Props {
	createDropdown?: ReactNode;
}

const LEARN_MORE_HREF = fuseScopeDocsUrl('/dashboards/dashboards/');

function EmptyState({ createDropdown }: Props): JSX.Element {
	return (
		<StateCard
			testId="dashboards-empty-state"
			icon={<LayoutGrid />}
			title="No dashboards yet."
			description="Create a dashboard to start visualizing your data"
			actions={
				createDropdown ? (
					<>
						{createDropdown}
						<Button
							type="button"
							variant="link"
							size="sm"
							data-testid="learn-more"
							className="tw:px-1"
							onClick={(): void => {
								logEvent('Dashboard List: Learn more clicked', {});
								openInNewTab(LEARN_MORE_HREF);
							}}
						>
							Learn more
							<ArrowUpRight />
						</Button>
					</>
				) : null
			}
		/>
	);
}

export default EmptyState;
