// Field-name allowlists that drive signal-specific cell rendering. Both legacy
// camelCase and snake_case variants are listed because the API has shipped both.
export const TIMESTAMP_FIELD_NAMES = new Set(['timestamp']);

export const HTTP_METHOD_FIELD_NAMES = new Set([
	'httpMethod',
	'http_method',
	'http.method',
	'http.request.method',
]);

export const RESPONSE_CODE_FIELD_NAMES = new Set([
	'responseStatusCode',
	'response_status_code',
	'http.status_code',
	'http.response.status_code',
]);

export const SPAN_STATUS_FIELD_NAMES = new Set([
	'hasError',
	'has_error',
	'statusCodeString',
	'status_code_string',
]);

export const DURATION_FIELD_NAMES = new Set(['durationNano', 'duration_nano']);

export const TRACE_ID_FIELD_NAMES = new Set(['traceID', 'trace_id']);

export const SERVICE_FIELD_NAMES = new Set(['service.name', 'serviceName']);

export const MONO_FIELD_NAMES = new Set(['name', 'span_id', 'spanID']);

// Literal class names so Tailwind generates them.
export const SERVICE_DOT_CLASSES = [
	'tw:bg-series-1',
	'tw:bg-series-2',
	'tw:bg-series-3',
	'tw:bg-series-4',
	'tw:bg-series-5',
	'tw:bg-series-6',
	'tw:bg-series-7',
];
