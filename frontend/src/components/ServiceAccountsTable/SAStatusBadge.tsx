import StatusBadge from 'components/PageTemplate/components/StatusBadge';

function SAStatusBadge({ status }: { status: string }): JSX.Element {
	const upper = status?.toUpperCase();
	if (upper === 'ACTIVE') {
		return (
			<StatusBadge tone="success" dot>
				ACTIVE
			</StatusBadge>
		);
	}
	if (upper === 'DELETED') {
		return (
			<StatusBadge tone="error" dot>
				DELETED
			</StatusBadge>
		);
	}
	return <StatusBadge tone="neutral">{status || 'UNKNOWN'}</StatusBadge>;
}

export default SAStatusBadge;
