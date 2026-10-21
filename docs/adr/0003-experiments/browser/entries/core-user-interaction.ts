import { init } from '../src/index';
import { userInteractionInstrumentation } from '../src/instrumentations/user-interaction';
const cfg = (window as unknown as { FUSESCOPE: Parameters<typeof init>[0] }).FUSESCOPE;
export const rum = init({ ...cfg, instrumentations: [userInteractionInstrumentation()] });
