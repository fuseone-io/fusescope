import { Link } from 'react-router-dom';
import CompactPageHeader from 'components/PageTemplate/components/CompactPageHeader';
import HeaderBandLayout from 'components/PageTemplate/components/HeaderBandLayout';
import { Button } from 'components/ui/button';
import { Skeleton } from 'components/ui/skeleton';
import ROUTES from 'constants/routes';
import { ArrowLeft, Bug, TriangleAlert } from 'lucide-react';

type ErrorDetailsStateProps =
	| { status: 'loading' }
	| { status: 'error'; message: string };

const SKELETON_ROWS = ['stats', 'stack', 'attributes'];

/** The page while its event loads, or when it could not be loaded. */
function ErrorDetailsState(props: ErrorDetailsStateProps): JSX.Element {
	const { status } = props;

	return (
		<HeaderBandLayout
			testId="error-details-page"
			header={
				<CompactPageHeader
					testId="error-details-header"
					icon={<Bug />}
					iconTone="error"
					title="Exception"
				/>
			}
		>
			<div className="fs-ui tw:flex tw:min-w-0 tw:flex-col tw:gap-4 tw:px-4 tw:pt-4 tw:pb-8 tw:font-sans tw:md:px-6">
				{status === 'loading' ? (
					<output
						data-testid="error-details-loading"
						aria-busy="true"
						aria-label="Loading exception"
						className="tw:flex tw:flex-col tw:gap-4"
					>
						{SKELETON_ROWS.map((row) => (
							<Skeleton key={row} className="tw:h-32 tw:rounded-xl tw:bg-muted" />
						))}
					</output>
				) : (
					<section
						role="alert"
						data-testid="error-details-error"
						className="tw:flex tw:flex-col tw:items-center tw:gap-3 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:px-6 tw:py-12 tw:text-center"
					>
						<span className="tw:flex tw:size-10 tw:items-center tw:justify-center tw:rounded-lg tw:bg-error-soft tw:text-error-ink">
							<TriangleAlert aria-hidden="true" className="tw:size-5" />
						</span>
						<h2 className="tw:text-base tw:font-semibold">
							This exception could not be loaded
						</h2>
						<p className="tw:max-w-prose tw:text-[13px] tw:text-muted-foreground">
							{props.message}
						</p>
						<Button
							asChild
							variant="outline"
							size="sm"
							className="tw:text-foreground!"
						>
							<Link to={ROUTES.ALL_ERROR}>
								<ArrowLeft />
								Back to exceptions
							</Link>
						</Button>
					</section>
				)}
			</div>
		</HeaderBandLayout>
	);
}

export default ErrorDetailsState;
