import { Button, Tooltip } from 'antd';
import cx from 'classnames';
import { ExplorerViews } from 'pages/LogsExplorer/utils';

import { TOOLBAR_VIEW_CONFIG } from './toolbarViewsConfig';

import './ToolbarActions.styles.scss';

interface ToolbarViewItem {
	name: string;
	key: string;
	show?: boolean;
	disabled?: boolean;
}

interface LeftToolbarActionsProps {
	items: Record<string, ToolbarViewItem>;
	selectedView: string;
	onChangeSelectedView: (view: ExplorerViews) => void;
}

const activeTab = 'active-tab';

export default function LeftToolbarActions({
	items,
	selectedView,
	onChangeSelectedView,
}: LeftToolbarActionsProps): JSX.Element {
	return (
		<div className="left-toolbar">
			{/* Buttons render in the order the caller declares its views. */}
			<div className="left-toolbar-query-actions">
				{Object.values(items).map((item) => {
					const config = TOOLBAR_VIEW_CONFIG[item?.key];

					if (!item?.show || !config) {
						return null;
					}

					const { icon: Icon, label, tooltip, className, testId } = config;

					return (
						<Tooltip key={item.key} title={tooltip}>
							<Button
								disabled={item.disabled}
								className={cx(
									className,
									'explorer-view-option',
									selectedView === item.key ? activeTab : '',
								)}
								onClick={(): void => onChangeSelectedView(item.key as ExplorerViews)}
							>
								<Icon size={14} data-testid={testId} />
								{label}
							</Button>
						</Tooltip>
					);
				})}
			</div>
		</div>
	);
}
