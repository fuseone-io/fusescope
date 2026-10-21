import { init } from '../src/index';
import { FetchInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/fetch';
import { NavigationTimingInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/navigation-timing';
import { UserActionInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/user-action';
import { XhrInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/xhr';
const cfg = (window as unknown as { FUSESCOPE: Parameters<typeof init>[0] }).FUSESCOPE;
const propagateTraceHeaderCorsUrls = cfg.propagateTo;
export const rum = init({
  ...cfg,
  instrumentations: [
    new NavigationTimingInstrumentation(),
    new FetchInstrumentation({ propagateTraceHeaderCorsUrls }),
    new XhrInstrumentation({ propagateTraceHeaderCorsUrls }),
    new UserActionInstrumentation(),
  ],
});
