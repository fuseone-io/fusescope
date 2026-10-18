import { ReactNode } from 'react';
import {
	generatePath,
	matchPath,
	useLocation,
	useParams,
} from 'react-router-dom';
import { showsGlobalTimePicker } from 'components/AppHeader/utils';
import HeaderRightSection from 'components/HeaderRightSection/HeaderRightSection';
import OverlayScrollbar from 'components/OverlayScrollbar/OverlayScrollbar';
import { TabRoutes } from 'components/RouteTab/types';
import { History } from 'history';
import { cn } from 'lib/utils';
import { Tabs as TabsPrimitive } from 'radix-ui';

interface ModuleTabsLayoutProps {
	title: string;
	icon: ReactNode;
	description?: ReactNode;
	routes: TabRoutes[];
	/** Used when no route matches the current path exactly. */
	activeKey: string;
	history: History<unknown>;
	onChangeHandler?: (key: string) => void;
	/** Defaults to share and feedback, unless the app header already shows them. */
	actions?: ReactNode;
	testId?: string;
	className?: string;
	/** Wraps the active section, e.g. to pad tabs that are not full-bleed. */
	contentClassName?: string;
}

function findActiveRoute(
	routes: TabRoutes[],
	pathname: string,
	activeKey: string,
): TabRoutes | undefined {
	return (
		routes.find((route) =>
			matchPath(pathname, { path: route.route.split('?')[0], exact: true }),
		) ?? routes.find((route) => route.key === activeKey)
	);
}

/**
 * A module page whose sections are routes (Logs, Traces, Metrics…): a compact
 * header band with the title and route tabs, and the active section below,
 * scrolling on its own like `RouteTab`.
 */
function ModuleTabsLayout({
	title,
	icon,
	description,
	routes,
	activeKey,
	history,
	onChangeHandler,
	actions,
	testId = 'module-tabs-layout',
	className,
	contentClassName,
}: ModuleTabsLayoutProps): JSX.Element {
	const { pathname } = useLocation();
	const params = useParams<Record<string, string>>();
	const active = findActiveRoute(routes, pathname, activeKey);

	const handleValueChange = (key: string): void => {
		onChangeHandler?.(key);
		const selected = routes.find((route) => route.key === key);
		if (selected) {
			history.push(generatePath(selected.route, params));
		}
	};

	const pageActions =
		actions === undefined && !showsGlobalTimePicker(pathname) ? (
			<HeaderRightSection enableAnnouncements={false} enableShare enableFeedback />
		) : (
			actions
		);

	return (
		<TabsPrimitive.Root
			value={active?.key ?? activeKey}
			onValueChange={handleValueChange}
			data-testid={testId}
			className={cn(
				'tw:flex tw:h-full tw:min-h-0 tw:flex-1 tw:flex-col tw:bg-background',
				className,
			)}
		>
			<div className="tw:flex tw:flex-none tw:flex-col tw:gap-2 tw:border-b tw:border-border tw:bg-surface-raised tw:px-4 tw:pt-4 tw:md:px-6">
				<div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3">
					<div className="fs-ui tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:gap-3 tw:font-sans tw:text-foreground">
						<span
							aria-hidden="true"
							className="tw:flex tw:size-8 tw:flex-none tw:items-center tw:justify-center tw:rounded-lg tw:bg-primary-soft tw:text-primary-ink tw:[&_svg:not([class*=size-])]:size-[18px]"
						>
							{icon}
						</span>
						<h1 className="tw:text-xl tw:leading-tight tw:font-semibold tw:tracking-[-0.01em]">
							{title}
						</h1>
						{description && (
							<span className="tw:text-[13px] tw:text-muted-foreground">
								{description}
							</span>
						)}
					</div>
					{pageActions && (
						<div
							data-testid="module-tabs-actions"
							className="tw:flex tw:items-center tw:gap-2"
						>
							{pageActions}
						</div>
					)}
				</div>
				<TabsPrimitive.List
					aria-label={`${title} sections`}
					className="fs-ui tw:flex tw:gap-6 tw:overflow-x-auto tw:overflow-y-hidden tw:font-sans"
				>
					{routes.map((route) => (
						<TabsPrimitive.Trigger
							key={route.key}
							value={route.key}
							data-route-key={route.key}
							className="tw:-mb-px tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-1.5 tw:border-b-2 tw:border-transparent tw:py-2.5 tw:text-sm tw:font-medium tw:whitespace-nowrap tw:text-muted-foreground! tw:transition-colors tw:outline-none tw:hover:text-foreground! tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:ring-inset tw:data-[state=active]:border-primary tw:data-[state=active]:text-primary!"
						>
							{route.name}
						</TabsPrimitive.Trigger>
					))}
				</TabsPrimitive.List>
			</div>
			{routes.map(({ key, Component }) => (
				<TabsPrimitive.Content
					key={key}
					value={key}
					className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:outline-none tw:data-[state=inactive]:hidden tw:[&>.overlay-scrollbar]:min-h-0 tw:[&>.overlay-scrollbar]:flex-1"
				>
					<OverlayScrollbar>
						{contentClassName ? (
							<div className={contentClassName}>
								<Component />
							</div>
						) : (
							<Component />
						)}
					</OverlayScrollbar>
				</TabsPrimitive.Content>
			))}
		</TabsPrimitive.Root>
	);
}

export default ModuleTabsLayout;
