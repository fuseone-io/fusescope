import { MouseEvent } from 'react';
import { Badge } from 'components/ui/badge';
import {
	SettingsNavSection,
	SidebarItem,
} from 'container/SideNav/sideNav.types';
import { cn } from 'lib/utils';
import { Settings } from 'lucide-react';

interface SettingsNavProps {
	sections: SettingsNavSection[];
	hrefFor: (key: string) => string;
	isActive: (key: string) => boolean;
	onSelect: (event: MouseEvent, item: SidebarItem) => void;
}

function SettingsNav({
	sections,
	hrefFor,
	isActive,
	onSelect,
}: SettingsNavProps): JSX.Element {
	return (
		<nav
			aria-label="Settings"
			data-testid="settings-page-sidenav"
			className="fs-ui tw:flex tw:flex-none tw:flex-col tw:gap-4 tw:overflow-y-auto tw:border-b tw:border-border tw:bg-surface-raised tw:px-3 tw:py-4 tw:font-sans tw:text-foreground tw:md:w-[232px] tw:md:border-r tw:md:border-b-0"
		>
			<div
				data-testid="settings-page-title"
				className="tw:flex tw:items-center tw:gap-2.5 tw:px-2.5 tw:text-[15px] tw:font-semibold"
			>
				<Settings
					aria-hidden="true"
					className="tw:size-[18px] tw:text-muted-foreground"
				/>
				Settings
			</div>
			{sections.map((section) => (
				<div
					key={section.key}
					className={cn(
						'settings-nav-section tw:flex tw:flex-col tw:gap-px',
						section.hasDivider && 'tw:border-t tw:border-border tw:pt-4',
					)}
				>
					{section.title && (
						<div className="tw:px-2.5 tw:pb-1 tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-subtle-foreground tw:uppercase">
							{section.title}
						</div>
					)}
					{section.items.map((item) => {
						const key = item.key as string;
						const active = isActive(key);
						return (
							<a
								key={key}
								href={hrefFor(key)}
								aria-current={active ? 'page' : undefined}
								data-testid={item.itemKey}
								onClick={(event): void => {
									event.preventDefault();
									onSelect(event, item);
								}}
								className={cn(
									'tw:flex tw:h-8 tw:items-center tw:gap-2 tw:rounded-md tw:px-2.5 tw:text-[13px] tw:text-muted-foreground! tw:no-underline! tw:hover:bg-muted tw:hover:text-foreground! tw:focus-visible:outline-2 tw:focus-visible:outline-ring',
									active &&
										'active tw:bg-primary-soft tw:font-medium tw:text-primary-ink! tw:hover:bg-primary-soft tw:hover:text-primary-ink!',
								)}
							>
								<span className="tw:flex-1 tw:truncate">{item.label}</span>
								{item.isBeta && (
									<Badge
										variant="secondary"
										className="tw:bg-primary-soft tw:px-1.5 tw:py-0 tw:text-[11px] tw:leading-[18px] tw:text-primary-ink"
									>
										Beta
									</Badge>
								)}
							</a>
						);
					})}
				</div>
			))}
		</nav>
	);
}

export default SettingsNav;
