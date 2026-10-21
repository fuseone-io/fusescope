import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import type { PropagationOptions } from './legacy';

export const xhrInstrumentation = (o: PropagationOptions = {}) =>
  new XMLHttpRequestInstrumentation({ propagateTraceHeaderCorsUrls: o.propagateTo ?? [] });
