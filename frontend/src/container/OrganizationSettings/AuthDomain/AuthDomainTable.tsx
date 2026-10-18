import { Button } from '@signozhq/ui/button';
import { AuthtypesGettableAuthDomainDTO } from 'api/generated/services/fuseScope.schemas';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import ListEmptyState from 'pages/Settings/components/ListEmptyState';
import LoadingRows from 'pages/Settings/components/LoadingRows';
import CopyToClipboard from 'periscope/components/CopyToClipboard';
import { getAbsoluteUrl } from 'utils/basePath';

import ManagedByConfigBadge from './ManagedByConfigBadge';
import SSOEnforcementToggle from './SSOEnforcementToggle';
import { isManagedByConfig, SSOType } from './utils';

interface AuthDomainTableProps {
	domains: AuthtypesGettableAuthDomainDTO[];
	loading: boolean;
	onConfigure: (domain: AuthtypesGettableAuthDomainDTO) => void;
	onDelete: (domain: AuthtypesGettableAuthDomainDTO) => void;
}

const COLUMN_COUNT = 4;

function AuthDomainTable({
	domains,
	loading,
	onConfigure,
	onDelete,
}: AuthDomainTableProps): JSX.Element {
	if (!loading && domains.length === 0) {
		return (
			<ListEmptyState testId="auth-domain-empty">
				No data. Add a domain to let its users sign in with SSO.
			</ListEmptyState>
		);
	}

	return (
		<Table className="auth-domain-list tw:min-w-[760px]">
			<TableHeader className="tw:bg-surface-sunken">
				<TableRow>
					<TableHead>Domain</TableHead>
					<TableHead className="tw:w-[140px]">Enforce SSO</TableHead>
					<TableHead>IDP Initiated SSO URL</TableHead>
					<TableHead className="tw:w-[260px]">Action</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{loading ? (
					<LoadingRows columns={COLUMN_COUNT} />
				) : (
					domains.map((domain) => {
						const managed = isManagedByConfig(domain);
						const relayPath = domain.authNProviderInfo?.relayStatePath;
						return (
							<TableRow key={domain.id} data-testid={`auth-domain-row-${domain.name}`}>
								<TableCell className="tw:font-medium">
									<span className="tw:inline-flex tw:items-center tw:gap-2">
										{domain.name}
										{managed && <ManagedByConfigBadge />}
									</span>
								</TableCell>
								<TableCell>
									<SSOEnforcementToggle
										isDefaultChecked={!!domain.enabled}
										record={domain}
									/>
								</TableCell>
								<TableCell>
									{relayPath ? (
										<CopyToClipboard textToCopy={getAbsoluteUrl(`/${relayPath}`)} />
									) : (
										<span className="tw:text-subtle-foreground">N/A</span>
									)}
								</TableCell>
								<TableCell>
									<span className="tw:flex tw:items-center tw:gap-6">
										<Button
											size="md"
											color="primary"
											onClick={(): void => onConfigure(domain)}
											variant="link"
											disabled={managed}
											disabledTooltip="Managed by the configuration file"
											testId="auth-domain-configure"
										>
											Configure {SSOType.get(domain.config?.kind || '')}
										</Button>
										{!managed && (
											<Button
												size="md"
												color="danger"
												onClick={(): void => onDelete(domain)}
												variant="link"
												testId="auth-domain-delete"
											>
												Delete
											</Button>
										)}
									</span>
								</TableCell>
							</TableRow>
						);
					})
				)}
			</TableBody>
		</Table>
	);
}

export default AuthDomainTable;
