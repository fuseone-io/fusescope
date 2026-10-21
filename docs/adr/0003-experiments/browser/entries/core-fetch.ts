import { init } from '../src/index';
import { fetchInstrumentation } from '../src/instrumentations/fetch';
const cfg = (window as unknown as { FUSESCOPE: Parameters<typeof init>[0] }).FUSESCOPE;
export const rum = init({ ...cfg, instrumentations: [fetchInstrumentation()] });
