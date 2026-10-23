import { Link } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { Button } from 'components/ui/button';
import ROUTES from 'constants/routes';
import { cn } from 'lib/utils';
import { ArrowRight, Code, Container, Server } from 'lucide-react';
import IngestionEndpoints from 'pages/GetStarted/components/IngestionEndpoints/IngestionEndpoints';
import { GUIDES } from 'pages/GetStarted/guides/registry';
import { docsPageUrl, guideRoute } from 'pages/GetStarted/utils';

import StartPath from './StartPath';

const LANGUAGE_ORDER = ['java', 'nodejs', 'python', 'dotnet', 'go'];

const CHIP_CLASS =
	'tw:inline-flex tw:h-7 tw:items-center tw:rounded-md tw:border tw:border-border tw:px-2.5 tw:text-[13px] tw:font-medium tw:text-foreground! tw:no-underline! tw:hover:border-primary';

const logPath = (path: string): void => {
	void logEvent('Homepage: Start path clicked', { path });
};

interface HomeOnboardingProps {
	className?: string;
}

/** Home before any data arrives: three ways to start and where to send. */
function HomeOnboarding({ className }: HomeOnboardingProps): JSX.Element {
	const languages = LANGUAGE_ORDER.flatMap((id) =>
		GUIDES.filter((guide) => guide.id === id),
	);

	return (
		<div
			data-testid="home-onboarding"
			className={cn(
				'fs-ui tw:flex tw:min-w-0 tw:flex-col tw:gap-4 tw:font-sans',
				className,
			)}
		>
			<div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] tw:gap-3">
				<StartPath
					id="home-path-app"
					icon={Code}
					title="Instrument an app"
					description="Traces, metrics and logs with the OpenTelemetry SDK."
					testId="home-path-app"
				>
					{languages.map((guide) => (
						<Link
							key={guide.id}
							to={guideRoute(guide.id)}
							onClick={(): void => logPath(guide.id)}
							className={CHIP_CLASS}
						>
							{guide.name}
						</Link>
					))}
					<Link to={`${ROUTES.GET_STARTED}?goal=apps`} className={CHIP_CLASS}>
						More
					</Link>
				</StartPath>
				<StartPath
					id="home-path-k8s"
					icon={Container}
					title="Monitor Kubernetes"
					description="One Helm chart for nodes, pods, events and container logs."
				>
					<Button asChild variant="outline" size="sm">
						<a
							href={docsPageUrl('sending-data/kubernetes')}
							target="_blank"
							rel="noopener noreferrer"
							data-testid="home-path-kubernetes"
							onClick={(): void => logPath('kubernetes')}
							className="tw:text-foreground! tw:no-underline!"
						>
							Install k8s-infra
						</a>
					</Button>
				</StartPath>
				<StartPath
					id="home-path-vm"
					icon={Server}
					title="Monitor a host"
					description="Run the collector on a VM for host metrics and log files."
				>
					<Button asChild variant="outline" size="sm">
						<a
							href={docsPageUrl('sending-data/collector-vm')}
							target="_blank"
							rel="noopener noreferrer"
							data-testid="home-path-host"
							onClick={(): void => logPath('host')}
							className="tw:text-foreground! tw:no-underline!"
						>
							Set up the collector
						</a>
					</Button>
				</StartPath>
			</div>
			<ContentPanel
				title="Already using OpenTelemetry?"
				subtitle="Point your exporter or collector here. No auth is required by default."
				actions={
					<Link
						to={`${ROUTES.GET_STARTED}?goal=otel`}
						data-testid="home-otel-snippets"
						className="tw:text-[13px] tw:font-medium tw:text-primary!"
					>
						Exporter snippets
					</Link>
				}
				bodyClassName="fs-ui tw:px-5 tw:pb-4 tw:font-sans"
			>
				<IngestionEndpoints showAuth={false} />
			</ContentPanel>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
				<Button asChild>
					<Link
						to={ROUTES.GET_STARTED}
						data-testid="home-browse-sources"
						onClick={(): void => logPath('catalog')}
						className="tw:bg-primary! tw:text-primary-foreground! tw:no-underline! tw:hover:bg-primary-strong!"
					>
						Browse all sources
						<ArrowRight aria-hidden="true" />
					</Link>
				</Button>
				<span className="tw:text-xs tw:text-subtle-foreground">
					Databases, logs, browser RUM, AI/LLM and more.
				</span>
			</div>
		</div>
	);
}

export default HomeOnboarding;
