import { AuthtypesGettableRoleDTO } from 'api/generated/services/fuseScope.schemas';
import { TableCell, TableRow } from 'components/ui/table';
import { cn } from 'lib/utils';
import { useTimezone } from 'providers/Timezone';

interface RoleRowProps {
	role: AuthtypesGettableRoleDTO;
	clickable: boolean;
	onOpen: (roleId: string, roleName: string) => void;
}

function RoleRow({ role, clickable, onOpen }: RoleRowProps): JSX.Element {
	const { formatTimezoneAdjustedTimestampOptional } = useTimezone();

	const open = (): void => {
		if (role.id && role.name) {
			onOpen(role.id, role.name);
		}
	};

	return (
		<TableRow
			data-testid="role-row"
			className={cn(
				'roles-table-row',
				clickable && 'roles-table-row--clickable tw:cursor-pointer',
			)}
			role={clickable ? 'button' : undefined}
			tabIndex={clickable ? 0 : undefined}
			onClick={clickable ? open : undefined}
			onKeyDown={
				clickable
					? (e): void => {
							if (e.key === 'Enter' || e.key === ' ') {
								open();
							}
						}
					: undefined
			}
		>
			<TableCell className="tw:font-medium">{role.name ?? '—'}</TableCell>
			<TableCell className="tw:max-w-0 tw:text-muted-foreground">
				<span className="tw:block tw:truncate" title={role.description}>
					{role.description ?? '—'}
				</span>
			</TableCell>
			<TableCell className="tw:text-xs tw:text-muted-foreground tw:tabular-nums">
				{formatTimezoneAdjustedTimestampOptional(role.updatedAt)}
			</TableCell>
			<TableCell className="tw:text-xs tw:text-muted-foreground tw:tabular-nums">
				{formatTimezoneAdjustedTimestampOptional(role.createdAt)}
			</TableCell>
		</TableRow>
	);
}

export default RoleRow;
