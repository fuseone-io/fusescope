import { Link } from 'react-router-dom';
import { Button } from 'components/ui/button';
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from 'components/ui/hover-card';
import { TriangleAlert } from 'lucide-react';
import { ServicesList } from 'types/api/metrics/getService';

import { MAX_TOP_LEVEL_OPERATIONS } from './constants';
import { topLevelOperationsUrl } from './utils';

interface ServiceNameCellProps {
	service: ServicesList;
	href: string;
}

function stopRowClick(event: React.SyntheticEvent): void {
	event.stopPropagation();
}

function ServiceNameCell({ service, href }: ServiceNameCellProps): JSX.Element {
	const { serviceName } = service;
	const hasTooManyOperations =
		(service.dataWarning?.topLevelOps?.length ?? 0) > MAX_TOP_LEVEL_OPERATIONS;

	return (
		<span className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
			{hasTooManyOperations && (
				<HoverCard openDelay={100}>
					<HoverCardTrigger asChild>
						<button
							type="button"
							data-testid="too-many-operations"
							aria-label="Too many top level operations"
							onClick={stopRowClick}
							className="tw:flex tw:cursor-pointer tw:text-error"
						>
							<TriangleAlert aria-hidden="true" className="tw:size-3.5" />
						</button>
					</HoverCardTrigger>
					<HoverCardContent
						side="right"
						align="start"
						className="tw:flex tw:w-72 tw:flex-col tw:gap-3"
						onClick={stopRowClick}
					>
						<p className="tw:font-semibold">Too Many Top Level Operations</p>
						<p className="tw:text-muted-foreground">
							The service <span className="tw:font-mono">{serviceName}</span> has too
							many top level operations. It makes the dashboard slow to load.
						</p>
						<Button asChild size="sm" className="tw:self-end">
							<Link to={topLevelOperationsUrl(serviceName)}>
								Show Top Level Operations
							</Link>
						</Button>
					</HoverCardContent>
				</HoverCard>
			)}
			<Link
				to={href}
				data-testid="service-name"
				onClick={stopRowClick}
				className="tw:truncate tw:font-mono tw:font-medium tw:text-primary! tw:hover:text-primary-strong! tw:hover:underline"
			>
				{serviceName}
			</Link>
		</span>
	);
}

export default ServiceNameCell;
