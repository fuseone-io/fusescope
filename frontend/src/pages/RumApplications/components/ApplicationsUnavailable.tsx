interface ApplicationsUnavailableProps {
	forbidden: boolean;
}

function ApplicationsUnavailable({
	forbidden,
}: ApplicationsUnavailableProps): JSX.Element {
	return (
		<div
			data-testid="rum-applications-unavailable"
			className="fs-ui tw:flex tw:flex-col tw:items-center tw:gap-1 tw:px-5 tw:py-16 tw:text-center tw:font-sans"
		>
			<p className="tw:text-sm tw:font-medium">
				{forbidden
					? 'Frontend applications are managed by admins and editors'
					: 'Applications could not be loaded'}
			</p>
			<p className="tw:text-[13px] tw:text-muted-foreground">
				{forbidden
					? 'Ask an admin or editor of this workspace for access.'
					: 'Check your connection and try again.'}
			</p>
		</div>
	);
}

export default ApplicationsUnavailable;
