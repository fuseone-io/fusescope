import { MemberStatus } from 'container/MembersSettings/utils';

export interface MemberRow {
	id: string;
	name?: string;
	email: string;
	status: MemberStatus;
	joinedOn: string | null;
	updatedAt?: string | null;
}

export type MemberSortKey = 'name' | 'status' | 'joinedOn';
