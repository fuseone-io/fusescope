interface CustomerStoryCardProps {
	avatar: string;
	personName: string;
	role: string;
	message: string;
	link: string;
}

function CustomerStoryCard({
	avatar,
	personName,
	role,
	message,
	link,
}: CustomerStoryCardProps): JSX.Element {
	return (
		<a
			href={link}
			target="_blank"
			rel="noopener noreferrer"
			className="tw:flex tw:flex-col tw:gap-3 tw:rounded-lg tw:border tw:border-border tw:bg-background tw:p-4 tw:text-foreground tw:transition-colors tw:hover:border-primary"
		>
			<span className="tw:flex tw:items-center tw:gap-3">
				<img
					src={avatar}
					alt=""
					className="tw:size-10 tw:flex-none tw:rounded-full tw:object-cover"
				/>
				<span className="tw:flex tw:min-w-0 tw:flex-col">
					<span className="tw:text-sm tw:font-semibold">{personName}</span>
					<span className="tw:text-xs tw:text-muted-foreground">{role}</span>
				</span>
			</span>
			<span className="tw:text-[13px] tw:leading-relaxed tw:text-muted-foreground">
				{message}
			</span>
		</a>
	);
}

export default CustomerStoryCard;
