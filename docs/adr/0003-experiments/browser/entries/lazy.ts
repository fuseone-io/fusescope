import { init } from '../src/index';
import { fetchInstrumentation } from '../src/instrumentations/fetch';
const cfg = (window as unknown as { FUSESCOPE: Parameters<typeof init>[0] }).FUSESCOPE;
const propagateTo = cfg.propagateTo;
export const rum = init({
  ...cfg,
  instrumentations: [fetchInstrumentation({ propagateTo })],
  lazyInstrumentations: async () => {
    const [d, x, u] = await Promise.all([
      import('../src/instrumentations/document-load'),
      import('../src/instrumentations/xhr'),
      import('../src/instrumentations/user-interaction'),
    ]);
    return [d.documentLoadInstrumentation(), x.xhrInstrumentation({ propagateTo }), u.userInteractionInstrumentation()];
  },
});
