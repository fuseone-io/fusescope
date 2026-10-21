import { PanelPoint } from 'container/WidgetCard/Panels/pointMenu.types';
import { IResourceAttribute } from 'hooks/useResourceAttribute/types';

const ENV_KEY = 'deployment.environment';

function formatSeconds(seconds: number): string {
	if (seconds >= 3600 && seconds % 3600 === 0) {
		return `${seconds / 3600} h`;
	}
	if (seconds >= 60 && seconds % 60 === 0) {
		return `${seconds / 60} min`;
	}
	return `${seconds} s`;
}

/** How the links' time range sits around the point, e.g. "±1 min around the point". */
function windowLabel({ timestamp, timeRange }: PanelPoint): string {
	const after = timeRange.endTime - timestamp;
	if (timestamp - timeRange.startTime === after) {
		return `±${formatSeconds(after)} around the point`;
	}
	return `${formatSeconds(timeRange.endTime - timeRange.startTime)} from the point`;
}

/** The footnote of a service chart's point menu: window, service and env. */
export function servicePointContext(
	point: PanelPoint,
	servicename: string,
	resourceQueries: IResourceAttribute[],
): string {
	const env = resourceQueries.find((query) => query.tagKey.endsWith(ENV_KEY));
	return [
		windowLabel(point),
		`service.name = ${servicename}`,
		env &&
			`${ENV_KEY} ${env.operator === 'Not IN' ? '!=' : '='} ${env.tagValue.join(', ')}`,
	]
		.filter(Boolean)
		.join(' · ');
}
