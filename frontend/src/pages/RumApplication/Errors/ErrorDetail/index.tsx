import { ApmWindow } from 'lib/apm/window';

import ErrorDetailBody from './components/ErrorDetailBody';
import { useErrorGroup } from './hooks/useErrorGroup';
import { useEventParam } from './hooks/useEventParam';

interface ErrorDetailProps {
	applicationId: string;
	fingerprint: string;
	release: string;
	window: ApmWindow;
	jvm?: boolean;
	onOpenSourceMaps: () => void;
}

const MESSAGE =
	'tw:m-0 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:px-5 tw:py-12 tw:text-center tw:text-[13px] tw:text-muted-foreground';

function ErrorDetail({
	applicationId,
	fingerprint,
	release,
	window,
	jvm = false,
	onOpenSourceMaps,
}: ErrorDetailProps): JSX.Element {
	const [eventId] = useEventParam();
	const state = useErrorGroup(
		applicationId,
		fingerprint,
		window,
		release,
		eventId,
	);
	if (state.status === 'loading') {
		return (
			<p data-testid="rum-error-loading" className={MESSAGE}>
				Loading error…
			</p>
		);
	}
	if (state.status === 'not-found') {
		return (
			<p data-testid="rum-error-not-found" className={MESSAGE}>
				No error group <span className="tw:font-mono">{fingerprint}</span>{' '}
				<span className="translate-safe">
					{release
						? `in this range and release ${release}. Widen the range to find it.`
						: 'in this range. Widen the range to find it.'}
				</span>
			</p>
		);
	}
	if (state.status === 'error') {
		return <p className={MESSAGE}>This error group could not be loaded.</p>;
	}
	return (
		<ErrorDetailBody
			applicationId={applicationId}
			group={state.group}
			release={release}
			window={window}
			jvm={jvm}
			onOpenSourceMaps={onOpenSourceMaps}
		/>
	);
}

export default ErrorDetail;
