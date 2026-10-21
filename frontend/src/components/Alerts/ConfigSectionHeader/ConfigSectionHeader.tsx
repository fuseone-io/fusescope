import { ChangeEvent } from 'react';
import { Tooltip } from 'antd';
import ToolbarSearch from 'components/Alerts/ToolbarSearch/ToolbarSearch';
import { Button } from 'components/ui/button';
import { BookOpen, Plus } from 'lucide-react';
import AlertsHeaderActions from 'pages/AlertList/components/AlertsHeaderActions';

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
	docsUrl?: string;
}

/**
 * Title, description and search of a configuration list; its create button
 * goes to the Alerts header band.
 */
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
	docsUrl,
}: ConfigSectionHeaderProps): JSX.Element {
	return (
		<div className="fs-ui tw:flex tw:flex-col tw:gap-3 tw:font-sans">
			<AlertsHeaderActions>
				<Tooltip title={actionTooltip || undefined}>
					<span>
						<Button onClick={onAction} disabled={actionDisabled}>
							<Plus aria-hidden="true" />
							{actionLabel}
						</Button>
					</span>
				</Tooltip>
			</AlertsHeaderActions>
			<div>
				<h2 className="tw:m-0 tw:text-base tw:font-semibold tw:text-foreground">
					{title}
				</h2>
				<p className="tw:m-0 tw:text-[13px] tw:text-muted-foreground">{subtitle}</p>
			</div>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2">
				<ToolbarSearch
					placeholder={searchPlaceholder}
					value={searchValue}
					onChange={onSearch}
					className="tw:max-w-[480px]"
				/>
				{docsUrl && (
					<Button variant="ghost" size="sm" asChild>
						<a href={docsUrl} target="_blank" rel="noopener noreferrer">
							<BookOpen aria-hidden="true" />
							Docs
						</a>
					</Button>
				)}
			</div>
		</div>
	);
}

export default ConfigSectionHeader;
