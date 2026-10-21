import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import type { PropagationOptions } from './legacy';

export const fetchInstrumentation = (o: PropagationOptions = {}) =>
  new FetchInstrumentation({ propagateTraceHeaderCorsUrls: o.propagateTo ?? [] });
