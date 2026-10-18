import { ReactNode } from 'react';
import PageHeader from 'components/PageTemplate/components/PageHeader';
import { LayoutGrid } from 'lucide-react';

import NewDashboardButton from './NewDashboardButton';

interface Props {
	/** The empty workspace carries its own create call to action. */
	showCreate: boolean;
	onCreate: () => void;
	actions?: ReactNode;
}

function DashboardsListHeader({
	showCreate,
	onCreate,
	actions,
}: Props): JSX.Element {
	return (
		<div className="tw:flex-none tw:border-b tw:border-border tw:bg-surface-raised tw:px-4 tw:py-4 tw:md:px-8">
			<PageHeader
				testId="dashboards-list-header"
				icon={<LayoutGrid />}
				title="Dashboards"
				className="tw:items-center"
				actions={
					(showCreate || actions) && (
						<>
							{actions}
							{showCreate && <NewDashboardButton onClick={onCreate} />}
						</>
					)
				}
			/>
		</div>
	);
}

export default DashboardsListHeader;
