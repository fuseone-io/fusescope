import { useAppContext } from 'providers/App/App';
import { USER_ROLES } from 'types/roles';

/** RUM applications and keys are managed by admins and editors. */
export function useCanManageRum(): boolean {
	const { user } = useAppContext();
	return user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.EDITOR;
}
