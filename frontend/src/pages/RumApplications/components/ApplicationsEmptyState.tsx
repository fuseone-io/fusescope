import SoonBadge from 'components/Rum/SoonBadge';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { Button } from 'components/ui/button';
import { AppWindow, Plus, Smartphone } from 'lucide-react';

import { SDK_ATTRIBUTES_URL } from '../constants';

interface ApplicationsEmptyStateProps {
	canManage: boolean;
	onCreate: () => void;
}

const STEPS = [
	['Create an application', 'Name, allowed origins and privacy policy.'],
	['Install the SDK', 'The npm package with the application’s public key.'],
	['Open your site', 'The first session shows up within seconds.'],
];

const PLATFORMS = [
	{ name: 'Web', note: 'React, Vue, plain JS', available: true },
	{ name: 'Android', note: 'Crashes, ANRs, app start', available: false },
	{ name: 'iOS', note: 'Crashes, app start', available: false },
];

function ApplicationsEmptyState({
	canManage,
	onCreate,
}: ApplicationsEmptyStateProps): JSX.Element {
	return (
		<div className="fs-ui tw:flex tw:justify-center tw:px-4 tw:py-12 tw:font-sans">
			<section
				aria-labelledby="rum-empty-title"
				data-testid="rum-applications-empty"
				className="tw:flex tw:w-full tw:max-w-[720px] tw:flex-col tw:gap-6 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:p-8"
			>
				<div className="tw:flex tw:flex-col tw:items-start tw:gap-3">
					<span
						aria-hidden="true"
						className="tw:flex tw:size-11 tw:items-center tw:justify-center tw:rounded-[10px] tw:bg-primary-soft tw:text-primary-ink"
					>
						<AppWindow className="tw:size-5" />
					</span>
					<h2
						id="rum-empty-title"
						className="tw:text-xl tw:font-semibold tw:tracking-[-0.01em]"
					>
						See what your users experience
					</h2>
					<p className="tw:text-sm tw:text-muted-foreground">
						Real User Monitoring records sessions, page loads, Web Vitals and
						JavaScript errors from the browser, and links each request to its backend
						trace. No personal data is collected unless you allow it.
					</p>
				</div>
				<ol className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(190px,1fr))] tw:gap-4">
					{STEPS.map(([title, note], index) => (
						<li key={title} className="tw:flex tw:gap-2.5">
							<span className="tw:flex tw:size-6 tw:flex-none tw:items-center tw:justify-center tw:rounded-full tw:bg-surface-sunken tw:text-xs tw:font-semibold tw:tabular-nums">
								{index + 1}
							</span>
							<span className="tw:flex tw:flex-col">
								<span className="tw:font-medium">{title}</span>
								<span className="tw:text-xs tw:text-muted-foreground">{note}</span>
							</span>
						</li>
					))}
				</ol>
				{canManage && (
					<Button
						className="tw:self-start"
						onClick={onCreate}
						data-testid="rum-empty-create"
					>
						<Plus />
						New application
					</Button>
				)}
				<div className="tw:flex tw:flex-col tw:gap-2">
					<span className="tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
						Platforms
					</span>
					<div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] tw:gap-2">
						{PLATFORMS.map((platform) => (
							<div
								key={platform.name}
								aria-disabled={!platform.available}
								className={
									platform.available
										? 'tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:border-primary tw:px-3 tw:py-2.5'
										: 'tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:border-border tw:px-3 tw:py-2.5 tw:text-muted-foreground'
								}
							>
								{platform.available ? (
									<AppWindow aria-hidden="true" className="tw:size-4" />
								) : (
									<Smartphone aria-hidden="true" className="tw:size-4" />
								)}
								<span className="tw:flex tw:flex-1 tw:flex-col">
									<span className="tw:font-medium">{platform.name}</span>
									<span className="tw:text-xs tw:text-muted-foreground">
										{platform.note}
									</span>
								</span>
								{platform.available ? (
									<StatusBadge tone="success">Available</StatusBadge>
								) : (
									<SoonBadge label="Coming soon" className="tw:h-5 tw:text-xs" />
								)}
							</div>
						))}
					</div>
				</div>
				<p className="tw:text-[13px] tw:text-muted-foreground">
					Already using the OpenTelemetry web SDK? Export OTLP to{' '}
					<span className="tw:font-mono tw:text-foreground">/rum/v1</span> with an
					application key.{' '}
					<a
						href={SDK_ATTRIBUTES_URL}
						target="_blank"
						rel="noreferrer"
						className="tw:text-primary! tw:underline! tw:underline-offset-2"
					>
						Required attributes
					</a>
				</p>
			</section>
		</div>
	);
}

export default ApplicationsEmptyState;
