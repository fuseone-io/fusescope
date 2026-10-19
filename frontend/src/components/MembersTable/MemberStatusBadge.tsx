import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { StatusTone } from 'components/PageTemplate/types';
import { MemberStatus } from 'container/MembersSettings/utils';

const STATUS: Record<MemberStatus, { tone: StatusTone; label: string }> = {
	[MemberStatus.Active]: { tone: 'success', label: 'ACTIVE' },
	[MemberStatus.Invited]: { tone: 'warning', label: 'INVITED' },
	[MemberStatus.Deleted]: { tone: 'error', label: 'DELETED' },
	[MemberStatus.Anonymous]: { tone: 'neutral', label: '—' },
};

function MemberStatusBadge({ status }: { status: MemberStatus }): JSX.Element {
	const { tone, label } = STATUS[status];
	return (
		<StatusBadge tone={tone} dot={status !== MemberStatus.Anonymous}>
			{label}
		</StatusBadge>
	);
}

export default MemberStatusBadge;
