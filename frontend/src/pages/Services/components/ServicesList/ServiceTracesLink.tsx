import { Link } from 'react-router-dom';
import { Button } from 'components/ui/button';
import { DraftingCompass } from 'lucide-react';
import { useServiceExplorerLinks } from 'pages/MetricsApplication/hooks/useServiceExplorerLinks';

interface ServiceTracesLinkProps {
	servicename: string;
}

/** The row's shortcut to its traces over the selected range. */
function ServiceTracesLink({
	servicename,
}: ServiceTracesLinkProps): JSX.Element {
	const { tracesUrl } = useServiceExplorerLinks(servicename);
	return (
		<Button
			asChild
			variant="ghost"
			size="icon-sm"
			className="tw:opacity-60 tw:group-hover:opacity-100 tw:focus-visible:opacity-100"
		>
			<Link
				to={tracesUrl}
				aria-label={`View traces for ${servicename}`}
				data-testid="service-view-traces-row"
				onClick={(event): void => event.stopPropagation()}
			>
				<DraftingCompass aria-hidden="true" />
			</Link>
		</Button>
	);
}

export default ServiceTracesLink;
