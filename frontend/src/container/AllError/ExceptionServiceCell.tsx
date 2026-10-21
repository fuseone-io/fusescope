import { Link, useLocation } from 'react-router-dom';
import ServiceKindIcon from 'components/ServiceKindIcon/ServiceKindIcon';
import { ServiceIdentity } from 'lib/apm/useServiceKinds';
import { serviceUrl } from 'pages/Services/components/ServicesList/utils';

interface ExceptionServiceCellProps {
	serviceName: string;
	identity: ServiceIdentity;
}

/** The service an exception group came from, with its type icon, linked to its page. */
function ExceptionServiceCell({
	serviceName,
	identity,
}: ExceptionServiceCellProps): JSX.Element {
	const { search } = useLocation();

	return (
		<span className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
			<ServiceKindIcon kind={identity.kind} />
			<Link
				to={serviceUrl(serviceName, search)}
				data-testid="exception-service"
				title={serviceName}
				className="tw:truncate tw:font-mono tw:text-xs tw:text-foreground! tw:hover:text-primary! tw:hover:underline"
			>
				{serviceName}
			</Link>
		</span>
	);
}

export default ExceptionServiceCell;
