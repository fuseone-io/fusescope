import { useState } from 'react';

import { DEFAULT_ENVIRONMENT, DEFAULT_SERVICE_NAME } from '../../constants';
import type { GuideRoute, GuideRuntime } from '../../guides/types';

export interface GuideForm {
	service: string;
	setService: (value: string) => void;
	environment: string;
	setEnvironment: (value: string) => void;
	route: GuideRoute;
	setRoute: (value: GuideRoute) => void;
	runtime: GuideRuntime;
	setRuntime: (value: GuideRuntime) => void;
}

export function useGuideForm(): GuideForm {
	const [service, setService] = useState(DEFAULT_SERVICE_NAME);
	const [environment, setEnvironment] = useState(DEFAULT_ENVIRONMENT);
	const [route, setRoute] = useState<GuideRoute>('direct');
	const [runtime, setRuntime] = useState<GuideRuntime>('shell');

	return {
		service,
		setService,
		environment,
		setEnvironment,
		route,
		setRoute,
		runtime,
		setRuntime,
	};
}
