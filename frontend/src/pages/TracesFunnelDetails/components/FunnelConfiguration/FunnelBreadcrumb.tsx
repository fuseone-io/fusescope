import { Link } from 'react-router-dom';
import ROUTES from 'constants/routes';

interface FunnelBreadcrumbProps {
	funnelName: string;
}

function FunnelBreadcrumb({ funnelName }: FunnelBreadcrumbProps): JSX.Element {
	return (
		<nav
			aria-label="Funnel breadcrumb"
			className="tw:flex tw:min-w-0 tw:items-center tw:gap-2 tw:text-[13px] tw:text-muted-foreground"
		>
			<Link
				to={ROUTES.TRACES_FUNNELS}
				className="tw:flex-none tw:text-muted-foreground! tw:hover:text-foreground! tw:hover:underline"
			>
				All funnels
			</Link>
			<span aria-hidden="true" className="tw:text-subtle-foreground">
				/
			</span>
			<span
				aria-current="page"
				className="tw:truncate tw:font-medium tw:text-foreground"
			>
				{funnelName}
			</span>
		</nav>
	);
}

export default FunnelBreadcrumb;
