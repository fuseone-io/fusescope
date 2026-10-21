import { init } from '../src/index';
import { documentLoadInstrumentation } from '../src/instrumentations/document-load';
import { fetchInstrumentation } from '../src/instrumentations/fetch';
import { userInteractionInstrumentation } from '../src/instrumentations/user-interaction';
import { xhrInstrumentation } from '../src/instrumentations/xhr';
const cfg = (window as unknown as { FUSESCOPE: Parameters<typeof init>[0] }).FUSESCOPE;
const propagateTo = cfg.propagateTo;
export const rum = init({
  ...cfg,
  instrumentations: [
    documentLoadInstrumentation(),
    fetchInstrumentation({ propagateTo }),
    xhrInstrumentation({ propagateTo }),
    userInteractionInstrumentation(),
  ],
});
