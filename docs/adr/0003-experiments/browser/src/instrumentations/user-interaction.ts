import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';

export const userInteractionInstrumentation = () =>
  new UserInteractionInstrumentation({ eventNames: ['click', 'submit', 'keydown'] });
