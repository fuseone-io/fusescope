import { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Plus } from '@signozhq/icons';
import { fuseScopeDocsUrl } from 'constants/docs';
import AuthZButton from 'lib/authz/components/AuthZButton/AuthZButton';
import AuthZTooltip from 'lib/authz/components/AuthZTooltip/AuthZTooltip';
import ROUTES from 'constants/routes';
import {
	RoleCreatePermission,
	RoleListPermission,
} from 'lib/authz/hooks/useAuthZ/permissions/role.permissions';
import { useRolesFeatureGate } from 'hooks/useRolesFeatureGate';
import SettingsPageShell from 'pages/Settings/components/SettingsPageShell';
import SettingsSearchInput from 'pages/Settings/components/SettingsSearchInput';

import RolesListingTable from './RolesComponents/RolesListingTable';

function RolesSettings(): JSX.Element {
	const [searchQuery, setSearchQuery] = useState('');
	const history = useHistory();
	const { isRolesEnabled } = useRolesFeatureGate();

	return (
		<SettingsPageShell
			testId="roles-settings"
			title="Roles"
			description={
				<>
					<span className="translate-safe">
						{isRolesEnabled
							? 'Create and manage custom roles for your team. '
							: 'The built-in roles of this instance.'}
					</span>{' '}
					<a
						href={fuseScopeDocsUrl('/administration/users-and-roles/#roles')}
						target="_blank"
						rel="noopener noreferrer"
						className="tw:text-primary tw:hover:underline"
					>
						Learn more
					</a>
				</>
			}
			actions={
				isRolesEnabled && (
					<AuthZButton
						size="md"
						checks={[RoleCreatePermission]}
						variant="solid"
						color="primary"
						onClick={(): void => history.push(ROUTES.ROLE_CREATE)}
						prefix={<Plus size={14} />}
					>
						Custom role
					</AuthZButton>
				)
			}
		>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
				<AuthZTooltip
					checks={[RoleListPermission]}
					triggerClassName="tw:min-w-0 tw:flex-[1_1_280px]"
				>
					<SettingsSearchInput
						placeholder="Search for roles..."
						value={searchQuery}
						onChange={(e): void => setSearchQuery(e.target.value)}
					/>
				</AuthZTooltip>
			</div>
			<RolesListingTable searchQuery={searchQuery} />
		</SettingsPageShell>
	);
}

export default RolesSettings;
