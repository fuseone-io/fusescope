import { init } from '../src/index';
import { UserActionInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/user-action';
const cfg = (window as unknown as { FUSESCOPE: Parameters<typeof init>[0] }).FUSESCOPE;
export const rum = init({ ...cfg, instrumentations: [new UserActionInstrumentation()] });
