import { quote } from 'lib/apm/filters';

export const RUM_ATTRIBUTES = {
	applicationId: 'fusescope.rum.application.id',
	platform: 'fusescope.rum.platform',
	route: 'fusescope.rum.view.route',
	errorSource: 'fusescope.rum.error.source',
	sessionId: 'session.id',
	serviceVersion: 'service.version',
	userAgent: 'user_agent.original',
	distroName: 'telemetry.distro.name',
	distroVersion: 'telemetry.distro.version',
	vitalName: 'browser.web_vital.name',
	vitalValue: 'browser.web_vital.value',
	vitalRating: 'browser.web_vital.rating',
	exceptionType: 'exception.type',
	exceptionMessage: 'exception.message',
} as const;

/**
 * `event.name` parses as the `event` field context, so the attribute is
 * named with its context.
 */
const EVENT_NAME = 'attribute.event.name';

export const VIEW_SPAN = 'view';

export const viewSpansFilter = `name = ${quote(VIEW_SPAN)}`;

export const exceptionEventsFilter = `${EVENT_NAME} = ${quote('exception')}`;

export const webVitalEventsFilter = `${EVENT_NAME} = ${quote('browser.web_vital')}`;

export const applicationFilter = (applicationId: string): string =>
	`${RUM_ATTRIBUTES.applicationId} = ${quote(applicationId)}`;

export const applicationsFilter = (applicationIds: string[]): string =>
	applicationIds.length === 1
		? applicationFilter(applicationIds[0])
		: `${RUM_ATTRIBUTES.applicationId} IN [${applicationIds.map(quote).join(', ')}]`;

export const vitalRatingCountIf = (rating: string): string =>
	`countIf(${RUM_ATTRIBUTES.vitalRating} = ${quote(rating)})`;
