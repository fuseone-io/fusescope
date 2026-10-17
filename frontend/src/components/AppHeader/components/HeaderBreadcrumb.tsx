import { Fragment } from 'react';
import { useSidebarNavigation } from 'components/AppSidebar/hooks/useSidebarNavigation';
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from 'components/ui/breadcrumb';
import { cn } from 'lib/utils';

import { useBreadcrumbs } from '../hooks/useBreadcrumbs';
import { isNavRoute } from '../utils';

function HeaderBreadcrumb(): JSX.Element {
	const crumbs = useBreadcrumbs();
	const { urlFor, navigate } = useSidebarNavigation();

	return (
		<Breadcrumb data-testid="app-header-breadcrumb" className="tw:min-w-0">
			<BreadcrumbList className="tw:flex-nowrap tw:gap-2 tw:text-[13px] tw:sm:gap-2">
				{crumbs.map((crumb, index) => {
					const isLast = index === crumbs.length - 1;
					const labelClass = cn('tw:truncate', crumb.mono && 'tw:font-mono');
					const href = isNavRoute(crumb.path) ? urlFor(crumb.path) : crumb.path;

					return (
						<Fragment key={crumb.key}>
							{index > 0 && (
								<BreadcrumbSeparator className="tw:text-subtle-foreground">
									/
								</BreadcrumbSeparator>
							)}
							<BreadcrumbItem
								className={cn('tw:min-w-0', isLast ? 'tw:shrink' : 'tw:max-w-48')}
							>
								{isLast ? (
									<BreadcrumbPage
										title={crumb.label}
										className={cn(labelClass, 'tw:font-medium')}
									>
										{crumb.label}
									</BreadcrumbPage>
								) : (
									<BreadcrumbLink
										href={href}
										title={crumb.label}
										className={cn(
											labelClass,
											'tw:text-muted-foreground! tw:hover:text-foreground!',
										)}
										onClick={(event): void => {
											event.preventDefault();
											navigate(crumb.path, event, href);
										}}
									>
										{crumb.label}
									</BreadcrumbLink>
								)}
							</BreadcrumbItem>
						</Fragment>
					);
				})}
			</BreadcrumbList>
		</Breadcrumb>
	);
}

export default HeaderBreadcrumb;
