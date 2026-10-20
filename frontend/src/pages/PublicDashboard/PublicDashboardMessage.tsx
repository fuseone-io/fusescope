import { ReactNode } from 'react';

import fuseScopeBrandLogoUrl from '@/assets/Logos/fusescope-brand-logo.svg';

interface PublicDashboardMessageProps {
	icon: ReactNode;
	title: string;
	description: string;
	testId: string;
}

/**
 * Branded full-page state for a public dashboard that can't be rendered. Public
 * viewers are anonymous, so every variant can only point them at the dashboard
 * owner — there are no in-app recovery actions.
 */
function PublicDashboardMessage({
	icon,
	title,
	description,
	testId,
}: PublicDashboardMessageProps): JSX.Element {
	return (
		<div className="public-dashboard-error-container" data-testid={testId}>
			<div className="perilin-bg" />

			<div className="public-dashboard-error-content-header">
				<div className="brand">
					<img src={fuseScopeBrandLogoUrl} alt="FuseScope" className="brand-logo" />

					<span className="brand-title">FuseScope</span>
				</div>

				<p className="brand-tagline">
					OpenTelemetry-Native Logs, Metrics and Traces in a single pane
				</p>
			</div>

			<div className="public-dashboard-error-content">
				<span aria-hidden="true" className="public-dashboard-error-message-icon">
					{icon}
				</span>
				<h1 className="public-dashboard-error-message">{title}</h1>
				<p className="public-dashboard-error-message-description">{description}</p>
			</div>
		</div>
	);
}

export default PublicDashboardMessage;
