import { init } from '../src/index';
import { XhrInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/xhr';
const cfg = (window as unknown as { FUSESCOPE: Parameters<typeof init>[0] }).FUSESCOPE;
export const rum = init({ ...cfg, instrumentations: [new XhrInstrumentation()] });
