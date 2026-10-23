import { ReactNode, useState } from 'react';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { Button } from 'components/ui/button';
import { Skeleton } from 'components/ui/skeleton';
import { Pencil } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { USER_ROLES } from 'types/roles';

import { useIngestion } from '../../hooks/useIngestion';
import CopyField from '../CopyField/CopyField';
import IngestionUrlEditor from './IngestionUrlEditor';

function FieldLabel({ children }: { children: ReactNode }): JSX.Element {
	return (
		<span className="tw:flex tw:min-h-6 tw:items-center tw:gap-2 tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
			{children}
		</span>
	);
}

interface IngestionEndpointsProps {
	/** Leave out the ingestion key column, e.g. on Home. */
	showAuth?: boolean;
}

/**
 * The OTLP endpoints from /onboarding/ingestion, copyable. Admins can set the
 * HTTP URL in place. Never reads ingestion keys: the community collector
 * takes none.
 */
function IngestionEndpoints({
	showAuth = true,
}: IngestionEndpointsProps): JSX.Element {
	const { user } = useAppContext();
	const { ingestion, isLoading } = useIngestion();
	const [editing, setEditing] = useState(false);
	const isAdmin = user?.role === USER_ROLES.ADMIN;

	const loading = <Skeleton className="tw:h-3 tw:w-40" />;
	const http = ingestion?.otlpHttpEndpoint ?? '';
	const grpc = ingestion?.otlpGrpcEndpoint ?? '';

	return (
		<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-2">
			<div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] tw:gap-x-4 tw:gap-y-3">
				<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1">
					<FieldLabel>OTLP gRPC</FieldLabel>
					<CopyField
						value={grpc}
						copyLabel="Copy OTLP gRPC endpoint"
						testId="ingestion-endpoint-grpc"
					>
						{isLoading ? loading : undefined}
					</CopyField>
				</div>
				<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1">
					<FieldLabel>
						OTLP HTTP
						{ingestion?.derived && (
							<StatusBadge tone="neutral" testId="ingestion-derived">
								Derived
							</StatusBadge>
						)}
						{isAdmin && ingestion && !editing && (
							<Button
								type="button"
								variant="ghost"
								size="xs"
								onClick={(): void => setEditing(true)}
								data-testid="ingestion-edit"
								className="tw:ml-auto tw:tracking-normal tw:normal-case"
							>
								<Pencil aria-hidden="true" />
								Edit
							</Button>
						)}
					</FieldLabel>
					{editing && ingestion ? (
						<IngestionUrlEditor
							ingestion={ingestion}
							onDone={(): void => setEditing(false)}
						/>
					) : (
						<CopyField
							value={http}
							copyLabel="Copy OTLP HTTP endpoint"
							testId="ingestion-endpoint-http"
						>
							{isLoading ? loading : undefined}
						</CopyField>
					)}
				</div>
				{showAuth && (
					<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1">
						<FieldLabel>Authentication</FieldLabel>
						<div
							data-testid="ingestion-auth"
							className="tw:flex tw:h-9 tw:min-w-0 tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-border tw:bg-surface-sunken tw:px-2.5 tw:text-[13px]"
						>
							{ingestion && !ingestion.authRequired ? (
								<>
									<span>Ingestion key: None required</span>
									<span className="tw:text-xs tw:text-subtle-foreground">
										collector default
									</span>
								</>
							) : (
								<span className="tw:text-muted-foreground">
									{ingestion ? 'Set by your collector' : loading}
								</span>
							)}
						</div>
					</div>
				)}
			</div>
			{ingestion?.derived && !editing && (
				<span className="tw:text-xs tw:text-subtle-foreground">
					Guessed from this FuseScope&apos;s address on the default ports.
					{isAdmin
						? ' Edit it if your apps reach the collector elsewhere.'
						: ' An admin can set the address your apps reach.'}
				</span>
			)}
		</div>
	);
}

export default IngestionEndpoints;
