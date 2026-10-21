import { init } from '../src/index';
const cfg = (window as unknown as { FUSESCOPE: Parameters<typeof init>[0] }).FUSESCOPE;
export const rum = init(cfg);
