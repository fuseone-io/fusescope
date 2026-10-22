import { Link } from 'react-router-dom';
import ROUTES from 'constants/routes';

function ApplicationNotFound(): JSX.Element {
	return (
		<div
			data-testid="rum-application-not-found"
			className="fs-ui tw:flex tw:flex-col tw:items-center tw:gap-1 tw:px-5 tw:py-16 tw:text-center tw:font-sans"
		>
			<p className="tw:text-sm tw:font-medium">
				This application could not be loaded
			</p>
			<p className="tw:text-[13px] tw:text-muted-foreground">
				It may have been deleted, or you may not have access.{' '}
				<Link
					to={ROUTES.RUM_APPLICATIONS}
					className="tw:text-primary! tw:underline! tw:underline-offset-2"
				>
					All applications
				</Link>
			</p>
		</div>
	);
}

export default ApplicationNotFound;
