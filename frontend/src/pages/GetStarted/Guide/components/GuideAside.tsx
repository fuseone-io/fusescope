import { Link } from 'react-router-dom';

import type { Guide } from '../../guides/types';
import { docsPageUrl } from '../../utils';
import AsideLabel from './AsideLabel';

const STEPS = [
	{ id: 'guide-step-service', label: '1 · Name your service' },
	{ id: 'guide-step-install', label: '2 · Install' },
	{ id: 'guide-step-run', label: '3 · Configure and run' },
	{ id: 'guide-step-verify', label: '4 · Check the connection' },
];

const LINK_CLASS = 'tw:text-[13px] tw:text-primary!';

interface GuideAsideProps {
	guide: Guide;
	endpoint: string;
}

function GuideAside({ guide, endpoint }: GuideAsideProps): JSX.Element {
	return (
		<aside
			aria-label="About this guide"
			className="tw:flex tw:min-w-0 tw:flex-[1_1_280px] tw:flex-col tw:gap-4"
		>
			<section className="tw:flex tw:flex-col tw:gap-3 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:p-4">
				<AsideLabel>Sending to</AsideLabel>
				<div className="tw:flex tw:flex-col tw:gap-0.5">
					<span
						data-testid="guide-sending-to"
						className="tw:font-mono tw:text-xs tw:break-all"
					>
						{endpoint}
					</span>
					<span className="tw:text-xs tw:text-subtle-foreground">
						{guide.protocol === 'grpc' ? 'OTLP gRPC' : 'OTLP HTTP'} · no ingestion key
					</span>
				</div>
				<AsideLabel>You get</AsideLabel>
				<span className="tw:flex tw:flex-wrap tw:gap-1.5">
					{guide.signals.map((signal) => (
						<span
							key={signal}
							className="tw:inline-flex tw:h-5 tw:items-center tw:rounded-sm tw:border tw:border-border tw:px-1.5 tw:text-xs tw:font-medium tw:text-muted-foreground"
						>
							{signal}
						</span>
					))}
				</span>
				<AsideLabel>Steps</AsideLabel>
				<nav aria-label="Guide steps" className="tw:-mx-2 tw:flex tw:flex-col">
					{STEPS.map((step) => (
						<a
							key={step.id}
							href={`#${step.id}`}
							className="tw:flex tw:min-h-8 tw:items-center tw:rounded-md tw:px-2 tw:text-[13px] tw:text-muted-foreground! tw:no-underline! tw:hover:bg-surface-sunken tw:hover:text-foreground!"
						>
							{step.label}
						</a>
					))}
				</nav>
			</section>
			<section className="tw:flex tw:flex-col tw:gap-2 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:p-4">
				<h2 className="tw:text-sm tw:font-semibold">Go further</h2>
				{guide.further.map((link) =>
					link.to.startsWith('/') ? (
						<Link key={link.to} to={link.to} className={LINK_CLASS}>
							{link.label}
						</Link>
					) : (
						<a
							key={link.to}
							href={docsPageUrl(link.to)}
							target="_blank"
							rel="noopener noreferrer"
							className={LINK_CLASS}
						>
							{link.label}
						</a>
					),
				)}
			</section>
		</aside>
	);
}

export default GuideAside;
