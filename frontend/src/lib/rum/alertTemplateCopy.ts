import { RumAlertTemplateId } from './alertTemplateTypes';

interface MappingRow {
	label: string;
	code: string;
	note: string;
}

interface TemplateCopy {
	title: string;
	description: string;
	/** How the template's query reads the SDK's data. */
	mapping: MappingRow[];
}

const SCOPE: MappingRow = {
	label: 'Scope',
	code: 'fusescope.rum.application.id',
	note: 'this application only; add a release or route filter to narrow it',
};

export const RUM_ALERT_COPY: Record<RumAlertTemplateId, TemplateCopy> = {
	lcp_p75: {
		title: 'LCP p75 above 2.5 s',
		description: 'Largest Contentful Paint per route, from page-load vitals.',
		mapping: [
			{
				label: 'Signal',
				code: "attribute.event.name = 'browser.web_vital'",
				note: 'log events sent by the SDK',
			},
			{
				label: 'Vital',
				code: "browser.web_vital.name = 'lcp'",
				note: 'inp, fcp and ttfb work the same way; cls has no unit',
			},
			{
				label: 'Value',
				code: 'p75(browser.web_vital.value)',
				note: 'a number attribute, in milliseconds',
			},
			{
				label: 'One alert per',
				code: 'fusescope.rum.view.route',
				note: 'the route the page was loaded on',
			},
			{
				label: 'Sample size',
				code: 'count()',
				note:
					'a p75 of a few page loads is noisy: keep alerts to routes with about 50 loads in the window, as the Views tab shows',
			},
			SCOPE,
		],
	},
	session_error_rate: {
		title: 'Session error rate above 5%',
		description:
			'Share of sessions with at least one JavaScript error or unhandled rejection.',
		mapping: [
			{
				label: 'A · numerator',
				code: "count_distinct(session.id) where attribute.event.name = 'exception'",
				note: 'sessions with at least one error',
			},
			{
				label: 'B · denominator',
				code: 'count_distinct(session.id)',
				note: 'sessions that sent any vital, click, action or error',
			},
			{
				label: 'Formula',
				code: 'A / B * 100',
				note: 'computed per evaluation step, from logs only',
			},
			SCOPE,
		],
	},
	js_error_count: {
		title: 'JS errors above 10',
		description: 'JavaScript errors and unhandled rejections in the window.',
		mapping: [
			{
				label: 'Events',
				code: "attribute.event.name = 'exception'",
				note: 'errors and unhandled rejections',
			},
			{
				label: 'Value',
				code: 'count()',
				note: 'summed over the window',
			},
			{
				label: 'One alert per',
				code: 'service.version or fusescope.rum.view.route',
				note: 'add one to Group by to alert per release or per route',
			},
			SCOPE,
		],
	},
};
