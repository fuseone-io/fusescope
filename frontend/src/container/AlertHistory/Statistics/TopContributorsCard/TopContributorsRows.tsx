import { useState } from 'react';
import logEvent from 'api/common/logEvent';
import TablePagination from 'components/PageTemplate/components/TablePagination';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { ConditionalAlertPopover } from 'container/AlertHistory/AlertPopover/AlertPopover';
import LabelChips from 'container/AlertHistory/LabelChips/LabelChips';
import { contributionPercent } from 'container/AlertHistory/utils/display';
import { AlertRuleStats, AlertRuleTopContributors } from 'types/api/alerts/def';

import ContributorCellTrigger from './ContributorCellTrigger';

const PAGE_SIZE = 10;

function TopContributorsRows({
	topContributors,
	totalCurrentTriggers,
}: {
	topContributors: AlertRuleTopContributors[];
	totalCurrentTriggers: AlertRuleStats['totalCurrentTriggers'];
}): JSX.Element {
	const [page, setPage] = useState(1);
	const isPaged = topContributors.length > PAGE_SIZE;
	const rows = isPaged
		? topContributors.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
		: topContributors;

	return (
		<>
			<Table>
				<TableHeader className="tw:bg-surface-sunken">
					<TableRow>
						<TableHead>Labels</TableHead>
						<TableHead className="tw:w-[28%]">Share</TableHead>
						<TableHead className="tw:w-24 tw:text-right">Count</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((record) => {
						const percent = contributionPercent(record.count, totalCurrentTriggers);
						const links = {
							relatedTracesLink: record.relatedTracesLink,
							relatedLogsLink: record.relatedLogsLink,
						};
						return (
							<TableRow
								key={`top-contributor-${record.fingerprint}`}
								data-testid="top-contributors-row"
								className="tw:hover:bg-surface-sunken"
								onClick={(): void => {
									void logEvent('Alert history: Top contributors row: Clicked', {
										labels: record.labels,
									});
								}}
							>
								<TableCell className="tw:py-2 tw:whitespace-normal">
									<ConditionalAlertPopover {...links}>
										<ContributorCellTrigger>
											<LabelChips labels={record.labels} maxVisible={2} />
										</ContributorCellTrigger>
									</ConditionalAlertPopover>
								</TableCell>
								<TableCell>
									<ConditionalAlertPopover {...links}>
										<ContributorCellTrigger className="tw:h-5">
											<span
												role="progressbar"
												aria-label="Share of triggers"
												aria-valuemin={0}
												aria-valuemax={100}
												aria-valuenow={percent}
												className="tw:block tw:h-1.5 tw:w-full tw:overflow-hidden tw:rounded-full tw:bg-border"
											>
												<span
													className="tw:block tw:h-full tw:rounded-full tw:bg-primary"
													style={{ width: `${percent}%` }}
												/>
											</span>
										</ContributorCellTrigger>
									</ConditionalAlertPopover>
								</TableCell>
								<TableCell className="tw:text-right">
									<ConditionalAlertPopover {...links}>
										<ContributorCellTrigger className="tw:justify-end">
											<span
												className="tw:font-mono tw:text-xs tw:text-muted-foreground tw:tabular-nums"
												data-testid="top-contributors-row-count"
											>
												{record.count}/{totalCurrentTriggers}
											</span>
										</ContributorCellTrigger>
									</ConditionalAlertPopover>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
			{isPaged && (
				<TablePagination
					page={page}
					pageSize={PAGE_SIZE}
					total={topContributors.length}
					onPageChange={setPage}
				/>
			)}
		</>
	);
}

export default TopContributorsRows;
