import { useState } from 'react';
import ConfigDetailItem from 'components/Alerts/ConfigSectionHeader/ConfigDetailItem';
import ConfigRowActions from 'components/Alerts/ConfigSectionHeader/ConfigRowActions';
import TagChip from 'components/PageTemplate/components/TagChip';
import { TableCell, TableRow } from 'components/ui/table';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import { useAppContext } from 'providers/App/App';
import { useTimezone } from 'providers/Timezone';
import { USER_ROLES } from 'types/roles';

import { ROUTING_POLICY_COLUMN_COUNT } from './constants';
import { RoutingPolicyListItemProps } from './types';

function RoutingPolicyListItem({
	routingPolicy,
	handlePolicyDetailsModalOpen,
	handleDeleteModalOpen,
}: RoutingPolicyListItemProps): JSX.Element {
	const { user } = useAppContext();
	const { formatTimezoneAdjustedTimestamp } = useTimezone();
	const [expanded, setExpanded] = useState(false);
	const isEditEnabled = user?.role !== USER_ROLES.VIEWER;
	const toggle = (): void => setExpanded((open) => !open);
	const formatDate = (value: string | undefined): string =>
		value
			? formatTimezoneAdjustedTimestamp(value, DATE_TIME_FORMATS.MONTH_DATETIME)
			: '-';

	return (
		<>
			<TableRow
				data-testid="routing-policy-row"
				onClick={toggle}
				className="tw:cursor-pointer"
			>
				<TableCell className="tw:h-14 tw:max-w-[320px] tw:whitespace-normal">
					<span className="tw:block tw:truncate tw:font-medium tw:text-foreground">
						{routingPolicy.name}
					</span>
					{routingPolicy.description && (
						<span
							className="tw:block tw:truncate tw:text-xs tw:text-muted-foreground"
							title={routingPolicy.description}
						>
							{routingPolicy.description}
						</span>
					)}
				</TableCell>
				<TableCell className="tw:max-w-[360px]">
					<code
						className="tw:block tw:truncate tw:font-mono tw:text-xs tw:text-foreground tw:[font-variant-ligatures:none]"
						title={routingPolicy.expression}
					>
						{routingPolicy.expression || '—'}
					</code>
				</TableCell>
				<TableCell className="tw:whitespace-normal">
					<div className="tw:flex tw:max-w-[280px] tw:flex-wrap tw:gap-1">
						{routingPolicy.channels.map((channel) => (
							<TagChip key={channel} title={channel}>
								{channel}
							</TagChip>
						))}
					</div>
				</TableCell>
				<TableCell className="tw:text-xs tw:text-muted-foreground">
					{routingPolicy.updatedAt ? (
						<>
							<span className="tw:block tw:text-foreground tw:tabular-nums">
								{formatDate(routingPolicy.updatedAt)}
							</span>
							<span className="tw:block">{routingPolicy.updatedBy}</span>
						</>
					) : (
						'—'
					)}
				</TableCell>
				<TableCell className="tw:w-px">
					<ConfigRowActions
						itemName={routingPolicy.name}
						expanded={expanded}
						onToggle={toggle}
						onEdit={
							isEditEnabled
								? (): void => handlePolicyDetailsModalOpen('edit', routingPolicy)
								: undefined
						}
						onDelete={
							isEditEnabled
								? (): void => handleDeleteModalOpen(routingPolicy)
								: undefined
						}
						editTestId="edit-routing-policy"
						deleteTestId="delete-routing-policy"
					/>
				</TableCell>
			</TableRow>
			{expanded && (
				<TableRow className="tw:bg-surface-sunken tw:hover:bg-surface-sunken">
					<TableCell
						colSpan={ROUTING_POLICY_COLUMN_COUNT}
						className="tw:py-4 tw:whitespace-normal"
					>
						<dl className="tw:m-0 tw:flex tw:flex-col tw:gap-2.5 tw:text-[13px]">
							<ConfigDetailItem
								title="Created by"
								value={routingPolicy.createdBy || '-'}
							/>
							<ConfigDetailItem
								title="Created on"
								value={formatDate(routingPolicy.createdAt)}
							/>
							<ConfigDetailItem
								title="Updated by"
								value={routingPolicy.updatedBy || '-'}
							/>
							<ConfigDetailItem
								title="Updated on"
								value={formatDate(routingPolicy.updatedAt)}
							/>
						</dl>
					</TableCell>
				</TableRow>
			)}
		</>
	);
}

export default RoutingPolicyListItem;
