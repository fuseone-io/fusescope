import { MouseEvent } from 'react';
import logEvent from 'api/common/logEvent';
import { fuseScopeDocsUrl } from 'constants/docs';
import ROUTES from 'constants/routes';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import history from 'lib/history';
import {
	ArrowUpRight,
	BookOpen,
	ChartColumn,
	Code,
	Container,
	LucideIcon,
} from 'lucide-react';

const GUIDES: {
	title: string;
	description: string;
	path: string;
	icon: LucideIcon;
}[] = [
	{
		title: 'Instrument applications',
		description: 'Send metrics from your services with the OpenTelemetry SDKs.',
		path: '/sending-data/instrumentation/',
		icon: Code,
	},
	{
		title: 'Kubernetes',
		description:
			'Collect cluster, node and pod metrics with the k8s-infra chart.',
		path: '/sending-data/kubernetes/',
		icon: Container,
	},
	{
		title: 'Metrics explorer guide',
		description: 'What this page shows once metrics arrive.',
		path: '/explore/metrics/',
		icon: BookOpen,
	},
];

/** Shown instead of the summary when nothing was received and no filter is set. */
function MetricsEmptyState(): JSX.Element {
	const { isCloudUser } = useGetTenantLicense();

	const handleSendingClick = (event: MouseEvent<HTMLAnchorElement>): void => {
		if (!isCloudUser) {
			return;
		}
		event.preventDefault();
		void logEvent('Metrics Explorer: Navigate to onboarding', {});
		history.push(ROUTES.GET_STARTED_WITH_CLOUD);
	};

	return (
		<div
			className="fs-ui tw:flex tw:justify-center tw:px-0 tw:py-8 tw:font-sans tw:md:py-12"
			data-testid="metrics-empty-state"
		>
			<section
				aria-labelledby="metrics-empty-title"
				className="tw:flex tw:w-full tw:max-w-[640px] tw:flex-col tw:gap-5 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:p-8 tw:text-foreground"
			>
				<div className="tw:flex tw:flex-col tw:items-start tw:gap-3">
					<span
						aria-hidden="true"
						className="tw:flex tw:size-11 tw:items-center tw:justify-center tw:rounded-[10px] tw:bg-primary-soft tw:text-primary-ink"
					>
						<ChartColumn className="tw:size-[22px]" />
					</span>
					<h2
						id="metrics-empty-title"
						className="tw:text-xl tw:font-semibold tw:tracking-[-0.01em]"
					>
						No metrics yet
					</h2>
					<p className="tw:text-sm tw:text-muted-foreground">
						When FuseScope receives metrics, they show up here with their type, unit,
						samples and time series. Point an OpenTelemetry SDK or Collector at
						FuseScope to start.
					</p>
				</div>
				<a
					href={fuseScopeDocsUrl('/sending-data/otlp/')}
					target="_blank"
					rel="noopener noreferrer"
					onClick={handleSendingClick}
					className="tw:inline-flex tw:h-9 tw:items-center tw:gap-2 tw:self-start tw:rounded-lg tw:bg-primary! tw:px-3.5 tw:text-sm tw:font-medium tw:text-primary-foreground! tw:no-underline! tw:hover:bg-primary-strong!"
				>
					Sending metrics to FuseScope
					<ArrowUpRight aria-hidden="true" className="tw:size-4" />
				</a>
				<div className="tw:flex tw:flex-col tw:gap-2">
					<span className="tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
						Other guides
					</span>
					{GUIDES.map(({ title, description, path, icon: Icon }) => (
						<a
							key={path}
							href={fuseScopeDocsUrl(path)}
							target="_blank"
							rel="noopener noreferrer"
							className="tw:flex tw:min-h-14 tw:items-center tw:gap-3 tw:rounded-[10px] tw:border tw:border-border tw:px-3.5 tw:py-2.5 tw:text-foreground! tw:no-underline! tw:transition-colors tw:hover:border-input tw:hover:bg-muted!"
						>
							<Icon
								aria-hidden="true"
								className="tw:size-[18px] tw:flex-none tw:text-subtle-foreground"
							/>
							<span className="tw:flex tw:flex-1 tw:flex-col">
								<span className="tw:text-sm tw:font-medium">{title}</span>
								<span className="tw:text-xs tw:text-muted-foreground">
									{description}
								</span>
							</span>
							<ArrowUpRight
								aria-hidden="true"
								className="tw:size-4 tw:flex-none tw:text-subtle-foreground"
							/>
						</a>
					))}
				</div>
			</section>
		</div>
	);
}

export default MetricsEmptyState;
