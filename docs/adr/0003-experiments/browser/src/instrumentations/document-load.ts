import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';

export const documentLoadInstrumentation = () => new DocumentLoadInstrumentation();
