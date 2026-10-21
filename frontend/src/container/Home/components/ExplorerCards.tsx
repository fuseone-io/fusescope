import { MouseEvent, ReactNode } from 'react';
import logEvent from 'api/common/logEvent';
import ROUTES from 'constants/routes';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import {
	BarChart3,
	BellPlus,
	DraftingCompass,
	LayoutDashboard,
	ScrollText,
} from 'lucide-react';
import { isModifierKeyPressed } from 'utils/app';

interface Shortcut {
	title: string;
	description: string;
	/** Analytics `source`. */
	source: string;
	route: string;
	icon: ReactNode;
}

const SHORTCUTS: Shortcut[] = [
	{
		title: 'Logs explorer',
		description: 'Filter logs and save views for the team',
		source: 'Logs',
		route: ROUTES.LOGS_EXPLORER,
		icon: <ScrollText />,
	},
	{
		title: 'Traces explorer',
		description: 'Find slow and failing requests',
		source: 'Traces',
		route: ROUTES.TRACES_EXPLORER,
		icon: <DraftingCompass />,
	},
	{
		title: 'Metrics explorer',
		description: 'Query and plot any metric',
		source: 'Metrics',
		route: ROUTES.METRICS_EXPLORER_EXPLORER,
		icon: <BarChart3 />,
	},
	{
		title: 'Create a dashboard',
		description: 'Visualize your data in panels',
		source: 'Dashboards',
		route: ROUTES.ALL_DASHBOARD,
		icon: <LayoutDashboard />,
	},
	{
		title: 'Create an alert',
		description: 'Get notified when a rule fires',
		source: 'Alerts',
		route: ROUTES.ALERTS_NEW,
		icon: <BellPlus />,
	},
];

/** Shortcuts to the explorers, a new dashboard and a new alert. */
function ExplorerCards(): JSX.Element {
	const { safeNavigate } = useSafeNavigate();

	const handleClick = (shortcut: Shortcut, event: MouseEvent): void => {
		void logEvent('Homepage: Explore clicked', { source: shortcut.source });
		safeNavigate(shortcut.route, { newTab: isModifierKeyPressed(event) });
	};

	return (
		<div
			data-testid="home-explorer-cards"
			className="fs-ui tw:grid tw:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] tw:gap-3 tw:font-sans"
		>
			{SHORTCUTS.map((shortcut) => (
				<button
					key={shortcut.source}
					type="button"
					onClick={(event): void => handleClick(shortcut, event)}
					className="tw:flex tw:cursor-pointer tw:items-start tw:gap-3 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:px-4 tw:py-3.5 tw:text-left tw:text-foreground tw:outline-none tw:transition-colors tw:hover:border-primary tw:focus-visible:ring-2 tw:focus-visible:ring-ring"
				>
					<span
						aria-hidden="true"
						className="tw:flex tw:size-8 tw:flex-none tw:items-center tw:justify-center tw:rounded-lg tw:bg-muted tw:text-muted-foreground tw:[&_svg]:size-4"
					>
						{shortcut.icon}
					</span>
					<span className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
						<span className="tw:text-[13px] tw:font-semibold">{shortcut.title}</span>
						<span className="tw:text-xs tw:text-muted-foreground">
							{shortcut.description}
						</span>
					</span>
				</button>
			))}
		</div>
	);
}

export default ExplorerCards;
