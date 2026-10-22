import type { RumtypesGettableApplicationKeyDTO } from 'api/generated/services/fuseScope.schemas';
import { RumtypesKeyStatusDTO } from 'api/generated/services/fuseScope.schemas';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { Button } from 'components/ui/button';
import dayjs from 'dayjs';
import { formatAgo } from 'lib/rum/format';
import { cn } from 'lib/utils';

import { expiresIn, maskedKey } from '../utils/keys';

interface KeyRowProps {
	applicationKey: RumtypesGettableApplicationKeyDTO;
	onRevoke?: () => void;
}

function KeyRow({ applicationKey, onRevoke }: KeyRowProps): JSX.Element {
	const expiring = applicationKey.status === RumtypesKeyStatusDTO.expiring;
	const created = dayjs(applicationKey.createdAt).format('MMM D, HH:mm');
	const used = applicationKey.lastUsedAt
		? `last used ${formatAgo(Date.parse(applicationKey.lastUsedAt))}`
		: 'not used yet';
	const until =
		expiring && applicationKey.expiresAt
			? `Still accepted until ${dayjs(applicationKey.expiresAt).format('MMM D, HH:mm')}, so pages already loaded keep sending`
			: `Created ${created}`;

	return (
		<div
			data-testid="rum-key-row"
			data-status={applicationKey.status}
			className="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:px-4 tw:py-3"
		>
			<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1">
				<span className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
					<span
						className={cn(
							'tw:font-mono tw:text-[13px] tw:font-medium',
							expiring && 'tw:text-muted-foreground',
						)}
					>
						{maskedKey(applicationKey.last4)}
					</span>
					{expiring && applicationKey.expiresAt ? (
						<StatusBadge tone="warning">
							Expires {expiresIn(applicationKey.expiresAt)}
						</StatusBadge>
					) : (
						<StatusBadge tone="success" dot>
							Active
						</StatusBadge>
					)}
				</span>
				<span className="tw:text-xs tw:text-subtle-foreground">
					{until} · {used}
				</span>
			</div>
			{onRevoke && (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					data-testid="rum-key-revoke"
					className="tw:text-error-ink tw:hover:bg-error-soft"
					onClick={onRevoke}
				>
					Revoke now
				</Button>
			)}
		</div>
	);
}

export default KeyRow;
