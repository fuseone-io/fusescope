import { fuseScopeDocsUrl } from 'constants/docs';

interface ServicesEmptyStateProps {
	searching: boolean;
}

function ServicesEmptyState({
	searching,
}: ServicesEmptyStateProps): JSX.Element {
	return (
		<div
			data-testid="services-empty"
			className="fs-ui tw:flex tw:flex-col tw:items-center tw:gap-1 tw:px-5 tw:py-12 tw:text-center tw:font-sans"
		>
			<p className="tw:text-sm tw:font-medium">
				{searching ? 'No services match the search' : 'No services'}
			</p>
			{!searching && (
				<p className="tw:text-[13px] tw:text-muted-foreground">
					Nothing reported in this time range.{' '}
					<a
						href={fuseScopeDocsUrl('/sending-data/instrumentation/')}
						target="_blank"
						rel="noreferrer"
						className="tw:text-primary! tw:hover:underline"
					>
						Instrument your application
					</a>
				</p>
			)}
		</div>
	);
}

export default ServicesEmptyState;
