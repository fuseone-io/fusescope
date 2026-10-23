import SideSheet from 'components/PageTemplate/components/SideSheet';
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import { Button } from 'components/ui/button';
import { ApmWindow } from 'lib/apm/window';
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
				<TitleTooltip title="Soon: alert on this route’s vitals and errors">
					<span className="tw:inline-flex">
						<Button
							variant="outline"
							size="sm"
							disabled
							data-testid="rum-route-create-alert"
						>
							<BellPlus aria-hidden="true" />
							Create alert
						</Button>
					</span>
				</TitleTooltip>
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
