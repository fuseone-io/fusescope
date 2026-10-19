interface UserAvatarCellProps {
	email?: string;
}

/** A user as a table cell: their initial in a circle, then their email. */
function UserAvatarCell({ email }: UserAvatarCellProps): JSX.Element {
	return (
		<span className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
			{email && (
				<span
					aria-hidden="true"
					className="tw:flex tw:size-5 tw:flex-none tw:items-center tw:justify-center tw:rounded-full tw:bg-brand-secondary-soft tw:text-[11px] tw:font-semibold tw:text-brand-secondary-ink"
				>
					{email.substring(0, 1).toUpperCase()}
				</span>
			)}
			<span className="tw:truncate tw:text-[13px] tw:text-muted-foreground">
				{email}
			</span>
		</span>
	);
}

export default UserAvatarCell;
