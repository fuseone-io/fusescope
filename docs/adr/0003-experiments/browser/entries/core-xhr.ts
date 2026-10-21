import { init } from '../src/index';
import { xhrInstrumentation } from '../src/instrumentations/xhr';
const cfg = (window as unknown as { FUSESCOPE: Parameters<typeof init>[0] }).FUSESCOPE;
export const rum = init({ ...cfg, instrumentations: [xhrInstrumentation()] });
