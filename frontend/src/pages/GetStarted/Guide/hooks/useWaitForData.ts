import { useState } from 'react';

import { STATUS_POLL_INTERVAL_MS } from '../../constants';
import { useOnboardingStatus } from '../../hooks/useOnboardingStatus';
import type { VerifyPhase, VerifyState } from '../types';
import { hasReceived } from '../utils';

interface WaitForData {
	state: VerifyState;
	start: () => void;
}

/**
 * After the user starts their app, polls /onboarding/status for the service
 * every 5 s, counting only what arrived since then.
 */
export function useWaitForData(service: string): WaitForData {
	const [phase, setPhase] = useState<VerifyPhase>({ status: 'idle' });
	const waiting = phase.status === 'waiting';
	const { status } = useOnboardingStatus({
		service: service.trim(),
		since: waiting ? phase.since : undefined,
		refetchInterval: STATUS_POLL_INTERVAL_MS,
		enabled: waiting && service.trim() !== '',
	});

	const start = (): void => setPhase({ status: 'waiting', since: Date.now() });

	if (phase.status === 'idle') {
		return { state: phase, start };
	}
	if (status && hasReceived(status)) {
		return {
			state: { status: 'receiving', since: phase.since, data: status },
			start,
		};
	}
	return {
		state: { status: 'waiting', since: phase.since, data: status },
		start,
	};
}
