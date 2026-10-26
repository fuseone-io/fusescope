import { Link } from 'react-router-dom';
import type { RumtypesApplicationDTO } from 'api/generated/services/fuseScope.schemas';
import CompactPageHeader from 'components/PageTemplate/components/CompactPageHeader';
import TagChip from 'components/PageTemplate/components/TagChip';
import SdkBadge from 'components/Rum/SdkBadge';
import { Button } from 'components/ui/button';
import { ApmWindow } from 'lib/apm/window';
import { logsExplorerUrl, tracesExplorerUrl } from 'lib/rum/links';
import { PLATFORM_LABELS } from 'lib/rum/platform';
import { SdkSupport } from 'lib/rum/types';
import { RumtypesPlatformDTO } from 'api/generated/services/fuseScope.schemas';
import {
	AppWindow,
	DraftingCompass,
	ScrollText,
	Settings2,
	Smartphone,
} from 'lucide-react';

import CreateAlertMenu from './CreateAlertMenu';
import DefaultEnvironmentChip from './DefaultEnvironmentChip';

interface OverviewHeaderProps {
	application?: RumtypesApplicationDTO;
	release?: string;
	sdk?: { name: string; version: string };
	support: SdkSupport;
	filter: string;
	window: ApmWindow;
	onOpenSettings: () => void;
}

function OverviewHeader({
	application,
	release,
	sdk,
	support,
	filter,
	window,
	onOpenSettings,
}: OverviewHeaderProps): JSX.Element {
	return (
		<CompactPageHeader
			icon={
				application?.platform === RumtypesPlatformDTO.android ? (
					<Smartphone />
				) : (
					<AppWindow />
				)
			}
			title={application?.name ?? 'Application'}
			titleMono
			testId="rum-overview-header"
			meta={
				application && (
					<span className="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
						<TagChip title="fusescope.rum.platform">
							{PLATFORM_LABELS[application.platform]}
						</TagChip>
						<DefaultEnvironmentChip environment={application.environment} />
						{release && <TagChip title="service.version">release {release}</TagChip>}
						{sdk && (
							<SdkBadge
								name={sdk.name}
								version={sdk.version}
								support={support}
								inline
								testId="rum-overview-sdk"
							/>
						)}
					</span>
				)
			}
			actions={
				<>
					{application && <CreateAlertMenu application={application} />}
					<Button asChild variant="outline">
						<Link
							to={tracesExplorerUrl(filter, window)}
							data-testid="rum-overview-traces"
						>
							<DraftingCompass aria-hidden="true" />
							View traces
						</Link>
					</Button>
					<Button asChild variant="outline">
						<Link
							to={logsExplorerUrl(filter, window)}
							data-testid="rum-overview-logs"
						>
							<ScrollText aria-hidden="true" />
							View logs
						</Link>
					</Button>
					<Button
						variant="outline"
						onClick={onOpenSettings}
						data-testid="rum-overview-settings"
					>
						<Settings2 aria-hidden="true" />
						Settings
					</Button>
				</>
			}
		/>
	);
}

export default OverviewHeader;
