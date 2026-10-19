import UserAvatarCell from 'components/PageTemplate/components/UserAvatarCell';

function EditedBy(name: string): JSX.Element {
	return (
		<span className="fs-ui tw:flex tw:min-w-0">
			<UserAvatarCell email={name} />
		</span>
	);
}

export default EditedBy;
