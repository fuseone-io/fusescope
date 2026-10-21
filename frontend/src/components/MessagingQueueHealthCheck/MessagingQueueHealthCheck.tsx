import { useState } from 'react';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import SideSheet from 'components/PageTemplate/components/SideSheet';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { Button } from 'components/ui/button';
import { LoaderCircle, Settings2 } from 'lucide-react';
import { countAttributes } from 'pages/MessagingQueues/kafkaReadiness';
import { MessagingQueueHealthCheckService } from 'pages/MessagingQueues/MessagingQueuesUtils';
import { useKafkaSetupRedirect } from 'pages/MessagingQueues/useKafkaSetupRedirect';

import AttributeCheckList, { AttributesFilters } from './AttributeCheckList';
import { useKafkaHealthChecks } from './useKafkaHealthChecks';

interface MessagingQueueHealthCheckProps {
	serviceToInclude: MessagingQueueHealthCheckService[];
	/** Opens the checklist once the checks land with something missing. */
	openWhenMissing?: boolean;
}

function MessagingQueueHealthCheck({
	serviceToInclude,
	openWhenMissing = false,
}: MessagingQueueHealthCheckProps): JSX.Element {
	const { responses, isLoading, isFetching } =
		useKafkaHealthChecks(serviceToInclude);
	const [filter, setFilter] = useState<AttributesFilters>(AttributesFilters.ALL);
	const [userOpen, setUserOpen] = useState<boolean | null>(null);
	const onFix = useKafkaSetupRedirect();

	const counts = countAttributes(responses.map(({ data }) => data));
	const failedChecks = responses.filter(({ errorMsg }) => !!errorMsg).length;
	const missing = counts.missing + failedChecks;
	const open = userOpen ?? (openWhenMissing && !isLoading && missing > 0);

	return (
		<>
			<Button
				variant="outline"
				size="sm"
				data-testid="kafka-health-check-button"
				aria-busy={isFetching}
				onClick={(): void => setUserOpen(true)}
			>
				{isFetching ? (
					<LoaderCircle className="tw:animate-spin" aria-hidden />
				) : (
					<Settings2 aria-hidden />
				)}
				Kafka configuration
				{!isLoading && missing > 0 && (
					<StatusBadge tone="warning" testId="kafka-health-check-missing">
						{missing} missing
					</StatusBadge>
				)}
			</Button>
			<SideSheet
				open={open}
				onClose={(): void => setUserOpen(false)}
				modal={false}
				width={420}
				testId="kafka-health-check-sheet"
				title="Kafka configuration"
				subtitle="Attributes and metrics the Kafka views read, checked over the last 15 minutes."
				toolbar={
					<div className="tw:py-3">
						<SegmentedControl
							label="Show attributes"
							value={filter}
							onChange={setFilter}
							options={[
								{ value: AttributesFilters.ALL, label: 'All', count: counts.all },
								{
									value: AttributesFilters.ERROR,
									label: 'Missing',
									count: missing,
									countTone: missing > 0 ? 'warning' : 'neutral',
								},
								{
									value: AttributesFilters.SUCCESS,
									label: 'Found',
									count: counts.found,
								},
							]}
						/>
					</div>
				}
				bodyClassName="tw:px-3 tw:py-3"
			>
				{isLoading ? (
					<p className="tw:px-2 tw:text-[13px] tw:text-muted-foreground">
						Checking the Kafka setup…
					</p>
				) : (
					<AttributeCheckList
						responses={responses}
						filter={filter}
						onFix={(service): void => onFix(service)}
					/>
				)}
			</SideSheet>
		</>
	);
}

export default MessagingQueueHealthCheck;
