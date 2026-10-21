import { KeyboardEvent, useMemo, useState } from 'react';
import type { ServiceaccounttypesGettableFactorAPIKeyDTO } from 'api/generated/services/fuseScope.schemas';
import SortableTableHead from 'components/PageTemplate/components/SortableTableHead';
import TablePagination from 'components/PageTemplate/components/TablePagination';
import { pageOf } from 'components/PageTemplate/utils';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import dayjs from 'dayjs';
import AuthZTooltip from 'lib/authz/components/AuthZTooltip/AuthZTooltip';
import {
	buildAPIKeyDeletePermission,
	buildSADetachPermission,
} from 'lib/authz/hooks/useAuthZ/permissions/service-account.permissions';
import { cn } from 'lib/utils';
import { X } from 'lucide-react';
import ActionButton from 'pages/Settings/components/ActionButton';

type ApiKey = ServiceaccounttypesGettableFactorAPIKeyDTO;
type SortKey = 'name' | 'expiry' | 'lastObservedAt';

interface KeySort {
	key: SortKey;
	direction: 'asc' | 'desc';
}

const COMPARE: Record<SortKey, (a: ApiKey, b: ApiKey) => number> = {
	name: (a, b) => (a.name ?? '').localeCompare(b.name ?? ''),
	expiry: (a, b) => {
		const left = a.expiresAt === 0 ? Infinity : a.expiresAt;
		const right = b.expiresAt === 0 ? Infinity : b.expiresAt;
		return left - right;
	},
	lastObservedAt: (a, b) => {
		const left = a.lastObservedAt
			? new Date(a.lastObservedAt).getTime()
			: -Infinity;
		const right = b.lastObservedAt
			? new Date(b.lastObservedAt).getTime()
			: -Infinity;
		return left - right;
	},
};

function Expiry({ expiresAt }: { expiresAt: number }): JSX.Element {
	if (expiresAt === 0) {
		return <span className="keys-tab__expiry--never">Never</span>;
	}
	const expiryDate = dayjs.unix(expiresAt);
	if (expiryDate.isBefore(dayjs())) {
		return (
			<span className="keys-tab__expiry--expired tw:text-error-ink tw:dark:text-error">
				Expired
			</span>
		);
	}
	return <span>{expiryDate.format(DATE_TIME_FORMATS.MONTH_DATE)}</span>;
}

interface KeysTableProps {
	keys: ApiKey[];
	isDisabled: boolean;
	accountId: string;
	currentPage: number;
	pageSize: number;
	onPageChange: (page: number) => void;
	onEdit: (keyId: string) => void;
	onRevoke: (keyId: string) => void;
	formatLastObservedAt: (
		lastObservedAt: string | Date | null | undefined,
	) => string;
}

function KeysTable({
	keys,
	isDisabled,
	accountId,
	currentPage,
	pageSize,
	onPageChange,
	onEdit,
	onRevoke,
	formatLastObservedAt,
}: KeysTableProps): JSX.Element {
	const [sort, setSort] = useState<KeySort | null>(null);

	const rows = useMemo(() => {
		if (!sort) {
			return keys;
		}
		const sign = sort.direction === 'asc' ? 1 : -1;
		return [...keys].sort((a, b) => sign * COMPARE[sort.key](a, b));
	}, [keys, sort]);

	const toggleSort = (key: SortKey): void =>
		setSort((current) =>
			current?.key === key
				? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
				: { key, direction: 'asc' },
		);

	const sortHead = (
		key: SortKey,
		label: string,
		align: 'left' | 'right',
		className?: string,
	): JSX.Element => (
		<SortableTableHead
			label={label}
			active={sort?.key === key}
			direction={sort?.key === key ? sort.direction : 'asc'}
			onSort={(): void => toggleSort(key)}
			align={align}
			className={className}
		/>
	);

	const editOnKey = (event: KeyboardEvent, keyId: string): void => {
		if ((event.key === 'Enter' || event.key === ' ') && !isDisabled) {
			if (event.key === ' ') {
				event.preventDefault();
			}
			onEdit(keyId);
		}
	};

	return (
		<div className="keys-tab__table tw:overflow-hidden tw:rounded-lg tw:border tw:border-border">
			<Table className="tw:table-fixed">
				<TableHeader className="tw:bg-surface-sunken">
					<TableRow>
						{sortHead('name', 'Name', 'left')}
						{sortHead('expiry', 'Expiry', 'right', 'tw:w-[130px]')}
						{sortHead('lastObservedAt', 'Last Observed At', 'right', 'tw:w-[190px]')}
						<TableHead className="tw:w-12">
							<span className="tw:sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{pageOf(rows, currentPage, pageSize).map((record) => (
						<TableRow
							key={record.id}
							role="button"
							tabIndex={0}
							aria-label={`Edit key ${record.name || 'options'}`}
							onClick={(): void => {
								if (!isDisabled) {
									onEdit(record.id);
								}
							}}
							onKeyDown={(event): void => editOnKey(event, record.id)}
							className={cn(!isDisabled && 'tw:cursor-pointer')}
						>
							<TableCell className="keys-tab__name-text tw:truncate tw:font-medium tw:text-foreground">
								{record.name ?? '—'}
							</TableCell>
							<TableCell className="tw:text-right tw:tabular-nums">
								<Expiry expiresAt={record.expiresAt} />
							</TableCell>
							<TableCell className="tw:text-right tw:text-muted-foreground tw:tabular-nums">
								{formatLastObservedAt(record.lastObservedAt)}
							</TableCell>
							<TableCell
								className="tw:text-right"
								onClick={(event): void => event.stopPropagation()}
							>
								<AuthZTooltip
									checks={[
										buildAPIKeyDeletePermission(record.id),
										buildSADetachPermission(accountId),
									]}
									enabled={!isDisabled && !!accountId}
									disabledTooltip={isDisabled ? 'Service account disabled' : undefined}
								>
									<ActionButton
										variant="ghost"
										size="icon-sm"
										aria-label="Revoke Key"
										title={isDisabled ? undefined : 'Revoke Key'}
										className="tw:text-error-ink tw:hover:bg-error-soft tw:hover:text-error-ink tw:dark:text-error"
										disabled={isDisabled}
										onClick={(event): void => {
											event.stopPropagation();
											onRevoke(record.id);
										}}
										testId="keys-tab-revoke-btn"
									>
										<X aria-hidden="true" />
									</ActionButton>
								</AuthZTooltip>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			<TablePagination
				page={currentPage}
				pageSize={pageSize}
				total={keys.length}
				onPageChange={onPageChange}
			/>
		</div>
	);
}

export default KeysTable;
