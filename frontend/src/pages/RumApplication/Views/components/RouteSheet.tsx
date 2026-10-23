import { Link } from 'react-router-dom';
import SideSheet from 'components/PageTemplate/components/SideSheet';
import { Button } from 'components/ui/button';
import { ApmWindow } from 'lib/apm/window';
import { useRumAlertUrl } from 'lib/rum/useRumAlertUrl';
import { BellPlus } from 'lucide-react';

import { useRouteDetail } from '../hooks/useRouteDetail';
import RouteDetail from './RouteDetail';

interface RouteSheetProps {
	applicationId: string;
	/** Empty, the sheet is closed. */
	route: string;
	release: string;
	window: ApmWindow;
	onClose: () => void;
}

function RouteSheet({
	applicationId,
	route,
	release,
	window,
	onClose,
}: RouteSheetProps): JSX.Element {
	const state = useRouteDetail(applicationId, route, window, release);
	const examples =
		state.status === 'ready' ? (state.detail.examplePaths ?? []) : [];
	const alertUrl = useRumAlertUrl('lcp_p75', { applicationId, route });

	return (
		<SideSheet
			open={Boolean(route)}
			onClose={onClose}
			width={760}
			testId="rum-route-sheet"
			title={<span className="tw:font-mono">{route}</span>}
			subtitle={
				<span>
					<span className="tw:font-mono">fusescope.rum.view.route</span>
					{examples.length > 0 && (
						<>
							{' '}
							· e.g. <span className="tw:font-mono">{examples.join(', ')}</span>
						</>
					)}
				</span>
			}
			actions={
				alertUrl ? (
					<Button asChild variant="outline" size="sm">
						<Link
							to={alertUrl}
							title="Alert when this route’s LCP p75 is above 2.5 s"
							data-testid="rum-route-create-alert"
						>
							<BellPlus aria-hidden="true" />
							Create alert
						</Link>
					</Button>
				) : (
					<Button
						variant="outline"
						size="sm"
						disabled
						data-testid="rum-route-create-alert"
					>
						<BellPlus aria-hidden="true" />
						Create alert
					</Button>
				)
			}
			bodyClassName="tw:flex tw:flex-col tw:gap-6"
		>
			{state.status === 'loading' && (
				<p className="tw:m-0 tw:text-[13px] tw:text-muted-foreground">
					Loading route…
				</p>
			)}
			{state.status === 'error' && (
				<p className="tw:m-0 tw:text-[13px] tw:text-muted-foreground">
					This route could not be loaded.
				</p>
			)}
			{state.status === 'ready' && (
				<RouteDetail
					applicationId={applicationId}
					detail={state.detail}
					release={release}
					window={window}
				/>
			)}
		</SideSheet>
	);
}

export default RouteSheet;
