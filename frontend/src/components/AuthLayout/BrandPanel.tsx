import { useQuery } from 'react-query';
import getVersion from 'api/v1/version/get';
import { fuseScopeDocsUrl } from 'constants/docs';
import { isKnownVersion } from 'utils/app';

import {
	BRAND_HIGHLIGHTS,
	FUSESCOPE_GITHUB_URL,
	VERSION_QUERY_KEY,
} from './constants';
import RingMotif from './RingMotif';

import fuseScopeLogoWhiteUrl from '@/assets/Logos/fusescope-logo-white.svg';

const FOOTER_LINK_CLASS =
	'tw:text-primary-ink! tw:hover:text-primary-strong! tw:hover:underline';

/** Always dark: the `dark` class scopes the dark tokens to the panel. */
function BrandPanel(): JSX.Element {
	const { data } = useQuery({
		queryKey: VERSION_QUERY_KEY,
		queryFn: getVersion,
	});
	const version = data?.data.version;

	return (
		<aside
			aria-label="FuseScope"
			className="dark tw:relative tw:flex tw:min-w-0 tw:flex-[1_1_520px] tw:flex-col tw:justify-between tw:gap-12 tw:overflow-hidden tw:bg-background tw:px-6 tw:py-10 tw:text-foreground tw:sm:px-14 tw:sm:py-12"
		>
			<RingMotif />
			<img
				src={fuseScopeLogoWhiteUrl}
				alt="FuseScope"
				className="tw:relative tw:h-9 tw:w-auto tw:self-start"
			/>
			<div className="tw:relative tw:flex tw:max-w-[460px] tw:flex-col tw:gap-7">
				<h2 className="tw:text-[28px] tw:leading-tight tw:font-semibold tw:tracking-[-0.025em] tw:sm:text-4xl">
					Traces, metrics and logs in one place.
				</h2>
				<ul className="tw:hidden tw:flex-col tw:gap-[18px] tw:sm:flex">
					{BRAND_HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
						<li key={title} className="tw:flex tw:items-start tw:gap-3.5">
							<Icon
								aria-hidden="true"
								strokeWidth={1.5}
								className="tw:mt-0.5 tw:size-5 tw:flex-none tw:text-primary-ink"
							/>
							<span>
								<strong className="tw:font-semibold">{title}</strong>{' '}
								<span className="tw:text-muted-foreground">{description}</span>
							</span>
						</li>
					))}
				</ul>
			</div>
			<p
				data-testid="auth-brand-footer"
				className="tw:relative tw:flex tw:flex-wrap tw:gap-x-1.5 tw:text-xs tw:text-subtle-foreground"
			>
				{isKnownVersion(version) ? (
					<span data-testid="auth-brand-version">
						FuseScope <span className="tw:font-mono">{version}</span>
					</span>
				) : (
					<span>FuseScope</span>
				)}
				<span aria-hidden="true">·</span>
				<a
					href={fuseScopeDocsUrl()}
					target="_blank"
					rel="noopener noreferrer"
					className={FOOTER_LINK_CLASS}
				>
					Documentation
				</a>
				<span aria-hidden="true">·</span>
				<a
					href={FUSESCOPE_GITHUB_URL}
					target="_blank"
					rel="noopener noreferrer"
					className={FOOTER_LINK_CLASS}
				>
					GitHub
				</a>
			</p>
		</aside>
	);
}

export default BrandPanel;
