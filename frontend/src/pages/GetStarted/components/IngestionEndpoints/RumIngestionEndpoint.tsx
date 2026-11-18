import { getBaseUrl } from 'utils/basePath';
import { useState } from 'react';
import type { OnboardingtypesIngestionDTO } from 'api/generated/services/fuseScope.schemas';
import { Button } from 'components/ui/button';
import CopyField from '../CopyField/CopyField';
import IngestionUrlEditor from './IngestionUrlEditor';

interface RumIngestionEndpointProps {
	ingestion?: OnboardingtypesIngestionDTO;
	isAdmin: boolean;
}

function RumIngestionEndpoint({
	ingestion,
	isAdmin,
}: RumIngestionEndpointProps): JSX.Element {
	const [editing, setEditing] = useState(false);
	return (
		<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1">
			<div className="tw:flex tw:min-h-6 tw:items-center tw:gap-2 tw:text-xs tw:font-medium tw:text-muted-foreground">
				<span>RUM HTTP</span>
				{isAdmin && ingestion && !editing && (
					<Button
						type="button"
						variant="ghost"
						size="xs"
						data-testid="rum-ingestion-edit"
						onClick={(): void => setEditing(true)}
					>
						Edit
					</Button>
				)}
			</div>
			{editing && ingestion ? (
				<IngestionUrlEditor
					ingestion={ingestion}
					kind="rum"
					onDone={(): void => setEditing(false)}
				/>
			) : (
				<CopyField
					value={
						ingestion ? ingestion.rumEndpoint || new URL(getBaseUrl()).origin : ''
					}
					copyLabel="Copy RUM endpoint"
					testId="ingestion-endpoint-rum"
				/>
			)}
			{ingestion && ingestion.rumDerived !== false && (
				<span className="tw:text-xs tw:text-subtle-foreground">
					UI origin is a guess. Confirm that its proxy routes /rum/v1 to the RUM
					collector.
				</span>
			)}
		</div>
	);
}

export default RumIngestionEndpoint;
