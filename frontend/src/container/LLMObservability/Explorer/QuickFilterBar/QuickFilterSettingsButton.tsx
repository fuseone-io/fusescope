import { useState } from 'react';
import { Settings2 as SettingsIcon } from '@signozhq/icons';
import { Button } from '@signozhq/ui/button';
import { Tooltip } from '@signozhq/ui/tooltip';
import QuickFiltersSettings from 'components/QuickFilters/QuickFiltersSettings/QuickFiltersSettings';
import { SignalType } from 'components/QuickFilters/types';
import { Sheet, SheetContent } from 'components/ui/sheet';
import AuthZButton from 'lib/authz/components/AuthZButton/AuthZButton';
import { QuickFilterManagePermissions } from 'lib/authz/hooks/useAuthZ/permissions/quick-filter.permissions';
import { useAuthZ } from 'lib/authz/hooks/useAuthZ/useAuthZ';
import { TelemetryFieldKey } from 'types/api/v5/queryRange';

interface QuickFilterSettingsButtonProps {
	signal: SignalType;
	customFilters: TelemetryFieldKey[];
	refetchCustomFilters: () => void;
}

/** Opens the quick-filter settings sheet, as the filter rail's settings icon did. */
function QuickFilterSettingsButton({
	signal,
	customFilters,
	refetchCustomFilters,
}: QuickFilterSettingsButtonProps): JSX.Element {
	const [isOpen, setIsOpen] = useState(false);
	const { deniedPermissions, isLoading } = useAuthZ(
		QuickFilterManagePermissions,
	);
	const isDisabled = isLoading || deniedPermissions.length > 0;

	return (
		<>
			{isDisabled ? (
				<AuthZButton
					checks={QuickFilterManagePermissions}
					variant="ghost"
					color="secondary"
					size="sm"
					icon
					aria-label="Edit quick filters"
					onClick={(): void => setIsOpen(true)}
					testId="settings-icon-container"
				>
					<SettingsIcon data-testid="settings-icon" size={14} />
				</AuthZButton>
			) : (
				<Tooltip title="Edit quick filters">
					<Button
						variant="ghost"
						color="secondary"
						size="sm"
						icon
						aria-label="Edit quick filters"
						aria-expanded={isOpen}
						onClick={(): void => setIsOpen(true)}
						testId="settings-icon-container"
					>
						<SettingsIcon data-testid="settings-icon" size={14} />
					</Button>
				</Tooltip>
			)}
			<Sheet
				open={isOpen}
				onOpenChange={(open): void => {
					if (!open) {
						setIsOpen(false);
					}
				}}
			>
				<SheetContent
					side="right"
					showCloseButton={false}
					aria-describedby={undefined}
					data-testid="quick-filters-settings-sheet"
					className="quick-filters-settings tw:w-[420px] tw:max-w-full tw:gap-0 tw:p-0 tw:sm:max-w-[420px]"
				>
					{isOpen && (
						<QuickFiltersSettings
							signal={signal}
							setIsSettingsOpen={setIsOpen}
							customFilters={customFilters}
							refetchCustomFilters={refetchCustomFilters}
						/>
					)}
				</SheetContent>
			</Sheet>
		</>
	);
}

export default QuickFilterSettingsButton;
