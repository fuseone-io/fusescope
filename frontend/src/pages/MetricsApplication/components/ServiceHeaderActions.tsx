import { Link } from 'react-router-dom';
import { Button } from 'components/ui/button';
import { DraftingCompass, ScrollText } from 'lucide-react';

import ApDexApplication from '../ApDex/ApDexApplication';
import { useServiceExplorerLinks } from '../hooks/useServiceExplorerLinks';

interface ServiceHeaderActionsProps {
	servicename: string;
}

function ServiceHeaderActions({
	servicename,
}: ServiceHeaderActionsProps): JSX.Element {
	const { tracesUrl, logsUrl } = useServiceExplorerLinks(servicename);

	return (
		<>
			<Button asChild variant="outline">
				<Link
					to={logsUrl}
					data-testid="service-view-logs"
					className="tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!"
				>
					<ScrollText aria-hidden="true" />
					View logs
				</Link>
			</Button>
			<Button asChild variant="outline">
				<Link
					to={tracesUrl}
					data-testid="service-view-traces"
					className="tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!"
				>
					<DraftingCompass aria-hidden="true" />
					View traces
				</Link>
			</Button>
			<ApDexApplication />
		</>
	);
}

export default ServiceHeaderActions;
