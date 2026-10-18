import { MouseEvent } from 'react';
import { SidebarHeader } from 'components/ui/sidebar';

import fuseScopeLogoUrl from '@/assets/Logos/fusescope-logo.svg';
import fuseScopeLogoWhiteUrl from '@/assets/Logos/fusescope-logo-white.svg';
import fuseScopeMarkUrl from '@/assets/Logos/fusescope-mark.svg';

interface SidebarBrandProps {
	homeUrl: string;
	onHome: (event: MouseEvent) => void;
}

function SidebarBrand({ homeUrl, onHome }: SidebarBrandProps): JSX.Element {
	return (
		<SidebarHeader className="tw:px-2 tw:pt-3 tw:pb-1">
			<div className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
				<a
					href={homeUrl}
					aria-label="FuseScope home"
					data-testid="app-sidebar-home"
					className="tw:flex tw:h-8 tw:shrink-0 tw:items-center tw:rounded-md tw:px-2 tw:outline-hidden tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:group-data-[collapsible=icon]:px-0"
					onClick={(event): void => {
						event.preventDefault();
						onHome(event);
					}}
				>
					<span className="tw:contents tw:group-data-[collapsible=icon]:hidden">
						<img
							src={fuseScopeLogoUrl}
							alt=""
							className="tw:block tw:h-6 tw:w-auto tw:dark:hidden"
						/>
						<img
							src={fuseScopeLogoWhiteUrl}
							alt=""
							className="tw:hidden tw:h-6 tw:w-auto tw:dark:block"
						/>
					</span>
					<img
						src={fuseScopeMarkUrl}
						alt=""
						className="tw:hidden tw:size-8 tw:group-data-[collapsible=icon]:block"
					/>
				</a>
			</div>
		</SidebarHeader>
	);
}

export default SidebarBrand;
