import { SeverityNumber, type Logger } from '@opentelemetry/api-logs';

export type ErrorSource = 'onerror' | 'unhandledrejection' | 'manual';

export function errorAttributes(error: unknown, source: ErrorSource): Record<string, string> {
  const attrs: Record<string, string> = { 'fusescope.rum.error.source': source };
  if (error instanceof Error) {
    attrs['exception.type'] = error.name;
    attrs['exception.message'] = error.message;
    if (error.stack) attrs['exception.stacktrace'] = error.stack;
  } else {
    attrs['exception.type'] = typeof error;
    attrs['exception.message'] = String(error);
  }
  return attrs;
}

export function captureError(logger: Logger, error: unknown, source: ErrorSource = 'manual'): void {
  const attrs = errorAttributes(error, source);
  logger.emit({
    eventName: 'exception',
    severityNumber: SeverityNumber.ERROR,
    severityText: 'ERROR',
    body: attrs['exception.message'],
    attributes: attrs,
  });
}

export function installErrorCapture(logger: Logger): void {
  window.addEventListener('error', (e) => {
    captureError(logger, e.error ?? e.message, 'onerror');
  });
  window.addEventListener('unhandledrejection', (e) => {
    captureError(logger, e.reason, 'unhandledrejection');
  });
}
