import { ReactNode } from 'react';
import CompactPageHeader from 'components/PageTemplate/components/CompactPageHeader';
import { LayoutGrid } from 'lucide-react';

import NewDashboardButton from './NewDashboardButton';

interface Props {
	/** The empty workspace carries its own create call to action. */
	showCreate: boolean;
	onCreate: () => void;
	/** Dashboards in the loaded list; the count line waits for it. */
	count?: number;
	actions?: ReactNode;
}

function DashboardsListHeader({
	showCreate,
	onCreate,
	count,
	actions,
}: Props): JSX.Element {
	return (
		<div className="tw:flex-none tw:border-b tw:border-border tw:bg-surface-raised tw:px-4 tw:py-4 tw:md:px-6">
			<CompactPageHeader
				testId="dashboards-list-header"
				icon={<LayoutGrid />}
				title="Dashboards"
				meta={
					count === undefined ? undefined : (
						<span data-testid="dashboards-count-line">
							<strong className="tw:font-semibold tw:text-foreground">
								{count.toLocaleString()}
							</strong>{' '}
							{count === 1 ? 'dashboard' : 'dashboards'}
						</span>
					)
				}
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
