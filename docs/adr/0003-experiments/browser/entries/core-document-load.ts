import { init } from '../src/index';
import { documentLoadInstrumentation } from '../src/instrumentations/document-load';
const cfg = (window as unknown as { FUSESCOPE: Parameters<typeof init>[0] }).FUSESCOPE;
export const rum = init({ ...cfg, instrumentations: [documentLoadInstrumentation()] });
