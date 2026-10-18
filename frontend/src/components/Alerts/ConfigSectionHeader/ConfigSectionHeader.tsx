import { ChangeEvent } from 'react';
import { Tooltip } from 'antd';
import ToolbarSearch from 'components/Alerts/ToolbarSearch/ToolbarSearch';
import { Button } from 'components/ui/button';
import { Plus } from 'lucide-react';

interface ConfigSectionHeaderProps {
	title: string;
	subtitle: string;
	searchPlaceholder: string;
	searchValue: string;
	onSearch: (event: ChangeEvent<HTMLInputElement>) => void;
	actionLabel: string;
	onAction: () => void;
	actionDisabled: boolean;
	/** Explains why the action is disabled. */
	actionTooltip?: string;
}

/** Title, description, search and the create button of a configuration list. */
function ConfigSectionHeader({
	title,
	subtitle,
	searchPlaceholder,
	searchValue,
	onSearch,
	actionLabel,
	onAction,
	actionDisabled,
	actionTooltip,
}: ConfigSectionHeaderProps): JSX.Element {
	return (
		<div className="fs-ui tw:flex tw:flex-col tw:gap-3 tw:font-sans">
			<div>
				<h2 className="tw:text-base tw:font-semibold tw:text-foreground">
					{title}
				</h2>
				<p className="tw:text-sm tw:text-muted-foreground">{subtitle}</p>
			</div>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
				<ToolbarSearch
					placeholder={searchPlaceholder}
					value={searchValue}
					onChange={onSearch}
				/>
				<Tooltip title={actionTooltip || undefined}>
					<span>
						<Button onClick={onAction} disabled={actionDisabled}>
							<Plus aria-hidden="true" />
							{actionLabel}
						</Button>
					</span>
				</Tooltip>
			</div>
		</div>
	);
}

export default ConfigSectionHeader;
