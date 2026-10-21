import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { Button } from 'components/ui/button';
import { CircleCheck, Layers, TriangleAlert } from 'lucide-react';
import { MessagingQueueHealthCheckService } from 'pages/MessagingQueues/MessagingQueuesUtils';

import { ServiceHealthResponse } from './useKafkaHealthChecks';

export enum AttributesFilters {
	ALL = 'all',
	SUCCESS = 'success',
	ERROR = 'error',
}

interface AttributeCheckListProps {
	responses: ServiceHealthResponse[];
	filter: AttributesFilters;
	onFix: (service: MessagingQueueHealthCheckService) => void;
}

interface AttributeRowProps {
	name: string;
	ok: boolean;
	reason?: string;
	onFix: () => void;
}

function AttributeRow({
	name,
	ok,
	reason,
	onFix,
}: AttributeRowProps): JSX.Element {
	return (
		<li
			data-testid={`attribute-${ok ? 'found' : 'missing'}`}
			className="tw:flex tw:min-h-8 tw:items-center tw:gap-2 tw:rounded-md tw:py-1 tw:pr-2 tw:pl-7 tw:text-[13px] tw:hover:bg-muted"
		>
			{ok ? (
				<CircleCheck
					aria-label="Found"
					className="tw:size-3.5 tw:flex-none tw:text-success"
				/>
			) : (
				<TriangleAlert
					aria-label="Missing"
					className="tw:size-3.5 tw:flex-none tw:text-warning"
				/>
			)}
			<span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:leading-snug">
				<span className="tw:truncate tw:font-mono tw:text-xs" title={name}>
					{name}
				</span>
				{!ok && reason && (
					<span className="tw:text-xs tw:text-muted-foreground">{reason}</span>
				)}
			</span>
			{!ok && (
				<Button
					variant="ghost"
					size="xs"
					onClick={onFix}
					aria-label={`Fix ${name}`}
					className="tw:text-primary"
				>
					Fix
				</Button>
			)}
		</li>
	);
}

function matchesFilter(
	status: string | undefined,
	filter: AttributesFilters,
): boolean {
	if (filter === AttributesFilters.SUCCESS) {
		return status === '1';
	}
	if (filter === AttributesFilters.ERROR) {
		return status === '0';
	}
	return true;
}

function AttributeCheckList({
	responses,
	filter,
	onFix,
}: AttributeCheckListProps): JSX.Element {
	return (
		<div
			className="tw:flex tw:flex-col tw:gap-3"
			data-testid="attribute-check-list"
		>
			{responses.map(({ service, title, data, errorMsg }) => {
				const attributes = data.filter((item) => !!item.attribute);
				const missing = attributes.filter((item) => item.status === '0').length;
				const visible = attributes.filter((item) =>
					matchesFilter(item.status, filter),
				);
				if (!errorMsg && visible.length === 0) {
					return null;
				}
				return (
					<section key={service} aria-label={title} className="tw:flex tw:flex-col">
						<div className="tw:flex tw:h-8 tw:items-center tw:gap-2 tw:px-2">
							<Layers className="tw:size-3.5 tw:text-muted-foreground" aria-hidden />
							<h3 className="tw:text-[13px] tw:font-semibold">{title}</h3>
							{errorMsg && <StatusBadge tone="error">Check failed</StatusBadge>}
							{!errorMsg &&
								(missing > 0 ? (
									<StatusBadge tone="warning">{missing} missing</StatusBadge>
								) : (
									<StatusBadge tone="success">All found</StatusBadge>
								))}
						</div>
						<ul className="tw:m-0 tw:flex tw:list-none tw:flex-col tw:p-0">
							{errorMsg ? (
								<AttributeRow
									name={title}
									ok={false}
									reason={errorMsg}
									onFix={(): void => onFix(service)}
								/>
							) : (
								visible.map((item) => (
									<AttributeRow
										key={item.attribute}
										name={item.attribute || ''}
										ok={item.status === '1'}
										reason={item.error_message}
										onFix={(): void => onFix(service)}
									/>
								))
							)}
						</ul>
					</section>
				);
			})}
		</div>
	);
}

export default AttributeCheckList;
