import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useListUsers } from 'api/generated/services/users';
import Panel from 'components/PageTemplate/components/Panel';
import { Button } from 'components/ui/button';
import EditMemberDrawer from 'components/EditMemberDrawer/EditMemberDrawer';
import InviteMembersModal from 'container/MembersSettings/components/InviteMembersModal/InviteMembersModal';
import MembersTable, { MemberRow } from 'components/MembersTable/MembersTable';
import useUrlQuery from 'hooks/useUrlQuery';
import { parseAsBoolean, useQueryState } from 'nuqs';
import SettingsPageShell from 'pages/Settings/components/SettingsPageShell';
import SettingsSearchInput from 'pages/Settings/components/SettingsSearchInput';
import StatusFilterMenu from 'pages/Settings/components/StatusFilterMenu';
import { StatusFilterOption } from 'pages/Settings/components/types';
import { Plus } from 'lucide-react';
import { toISOString } from 'utils/app';

import { FilterMode, MemberStatus, toMemberStatus } from './utils';

const PAGE_SIZE = 20;

function MembersSettings(): JSX.Element {
	const history = useHistory();
	const urlQuery = useUrlQuery();
	const pageParam = parseInt(urlQuery.get('page') ?? '1', 10);
	const currentPage = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

	// TODO(nuqs): Replace with nuqs once the nuqs setup and integration is done - for search
	const [searchQuery, setSearchQuery] = useState('');
	const [filterMode, setFilterMode] = useState<FilterMode>(FilterMode.All);
	const [isInviteModalOpen, setIsInviteModalOpen] = useQueryState(
		'invite',
		parseAsBoolean.withDefault(false),
	);
	const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);

	const { data: usersData, isLoading, refetch: refetchUsers } = useListUsers();

	const allMembers = useMemo(
		(): MemberRow[] =>
			(usersData?.data ?? []).map((user) => ({
				id: user.id,
				name: user.displayName,
				email: user.email ?? '',
				status: toMemberStatus(user.status ?? ''),
				joinedOn: toISOString(user.createdAt),
				updatedAt: toISOString(user?.updatedAt),
			})),
		[usersData],
	);

	const filteredMembers = useMemo((): MemberRow[] => {
		let result = allMembers;

		if (filterMode === FilterMode.Invited) {
			result = result.filter((m) => m.status === MemberStatus.Invited);
		} else if (filterMode === FilterMode.Deleted) {
			result = result.filter((m) => m.status === MemberStatus.Deleted);
		}

		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			result = result.filter(
				(m) =>
					m?.name?.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
			);
		}

		return result;
	}, [allMembers, filterMode, searchQuery]);

	// TODO(nuqs): Replace with nuqs once the nuqs setup and integration is done
	const setPage = useCallback(
		(page: number): void => {
			urlQuery.set('page', String(page));
			history.replace({ search: urlQuery.toString() });
		},
		[history, urlQuery],
	);

	useEffect(() => {
		if (filteredMembers.length === 0) {
			return;
		}
		const maxPage = Math.ceil(filteredMembers.length / PAGE_SIZE);
		if (currentPage > maxPage) {
			setPage(maxPage);
		}
		if (currentPage < 1) {
			setPage(1);
		}
	}, [filteredMembers.length, currentPage, setPage]);

	const pendingCount = allMembers.filter(
		(m) => m.status === MemberStatus.Invited,
	).length;
	const deletedCount = allMembers.filter(
		(m) => m.status === MemberStatus.Deleted,
	).length;
	const totalCount = allMembers.length;

	const filterOptions: StatusFilterOption<FilterMode>[] = [
		{ value: FilterMode.All, label: 'All members', count: totalCount },
		{ value: FilterMode.Invited, label: 'Pending invites', count: pendingCount },
		{ value: FilterMode.Deleted, label: 'Deleted', count: deletedCount },
	];

	const handleFilterChange = (mode: FilterMode): void => {
		setFilterMode(mode);
		setPage(1);
	};

	const handleInviteComplete = useCallback((): void => {
		void refetchUsers();
	}, [refetchUsers]);

	const handleRowClick = useCallback((member: MemberRow): void => {
		setSelectedMember(member);
	}, []);

	const handleDrawerClose = useCallback((): void => {
		setSelectedMember(null);
	}, []);

	const handleMemberEditComplete = useCallback((): void => {
		void refetchUsers();
	}, [refetchUsers]);

	return (
		<SettingsPageShell
			testId="members-settings"
			title="Members"
			description="Overview of people added to this workspace."
			actions={
				<Button onClick={(): void => void setIsInviteModalOpen(true)}>
					<Plus aria-hidden="true" />
					Invite member
				</Button>
			}
		>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
				<StatusFilterMenu
					options={filterOptions}
					value={filterMode}
					onChange={handleFilterChange}
				/>
				<SettingsSearchInput
					name="members-search"
					placeholder="Search by name or email..."
					value={searchQuery}
					onChange={(e): void => {
						setSearchQuery(e.target.value);
						setPage(1);
					}}
				/>
			</div>
			<Panel className="tw:overflow-hidden">
				<MembersTable
					data={filteredMembers}
					loading={isLoading}
					total={filteredMembers.length}
					currentPage={currentPage}
					pageSize={PAGE_SIZE}
					searchQuery={searchQuery}
					onPageChange={setPage}
					onRowClick={handleRowClick}
				/>
			</Panel>

			<InviteMembersModal
				open={isInviteModalOpen}
				onClose={(): void => void setIsInviteModalOpen(null)}
				onComplete={handleInviteComplete}
			/>

			<EditMemberDrawer
				member={selectedMember}
				open={selectedMember !== null}
				onClose={handleDrawerClose}
				onComplete={handleMemberEditComplete}
			/>
		</SettingsPageShell>
	);
}

export default MembersSettings;
