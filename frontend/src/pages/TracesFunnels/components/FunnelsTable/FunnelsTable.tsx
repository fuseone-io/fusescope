import Panel from 'components/PageTemplate/components/Panel';
import { Skeleton } from 'components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { FunnelData } from 'types/api/traceFunnels';

import FunnelsEmptyState from '../FunnelsEmptyState/FunnelsEmptyState';
import FunnelRow from './FunnelRow';

interface FunnelsTableProps {
	isLoading: boolean;
	isError: boolean;
	data: FunnelData[];
	onCreateFunnel: () => void;
}

const SKELETON_ROWS = ['a', 'b', 'c'];

function FunnelsTable({
	isLoading,
	isError,
	data,
	onCreateFunnel,
}: FunnelsTableProps): JSX.Element {
	if (isError) {
		return (
			<Panel testId="funnels-error">
				<p className="fs-ui tw:m-0 tw:px-5 tw:py-12 tw:text-center tw:font-sans tw:text-[13px] tw:text-muted-foreground">
					Something went wrong
				</p>
			</Panel>
		);
	}

	if (!isLoading && data.length === 0) {
		return <FunnelsEmptyState onCreateFunnel={onCreateFunnel} />;
	}

	return (
		<Panel testId="funnels-table" className="tw:overflow-hidden">
			<Table className="tw:min-w-[760px] tw:table-fixed" aria-label="Funnels">
				<TableHeader className="tw:bg-surface-sunken">
					<TableRow>
						<TableHead className="tw:px-4">Name</TableHead>
						<TableHead className="tw:w-[190px] tw:px-4">Created</TableHead>
						<TableHead className="tw:w-[260px] tw:px-4">Created by</TableHead>
						<TableHead className="tw:w-14 tw:px-4">
							<span className="tw:sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{isLoading
						? SKELETON_ROWS.map((row) => (
								<TableRow key={row} data-testid="funnel-row-loading">
									<TableCell colSpan={4} className="tw:h-12 tw:px-4">
										<Skeleton className="tw:h-5 tw:bg-muted" />
									</TableCell>
								</TableRow>
							))
						: data.map((funnel) => (
								<FunnelRow key={funnel.funnel_id} funnel={funnel} />
							))}
				</TableBody>
			</Table>
		</Panel>
	);
}

export default FunnelsTable;
