import type { Context } from '@opentelemetry/api';
import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace';
import { scrubAttributes } from './scrub';
import type { SessionManager } from './session';

export interface RumContext {
  sessions: SessionManager;
  currentRoute: () => string | undefined;
  allowedQueryParams: readonly string[];
}

function rumAttributes(ctx: RumContext): Record<string, string> {
  const s = ctx.sessions.get();
  const attrs: Record<string, string> = { 'session.id': s.id };
  if (s.previousId) attrs['session.previous_id'] = s.previousId;
  const route = ctx.currentRoute();
  if (route) attrs['fusescope.rum.view.route'] = route;
  return attrs;
}

export class RumSpanProcessor implements SpanProcessor {
  constructor(private readonly ctx: RumContext) {}

  onStart(span: Span): void {
    span.setAttributes({ ...rumAttributes(this.ctx), ...span.attributes });
  }

  onEnding(span: Span): void {
    span.setAttributes(scrubAttributes(span.attributes, this.ctx.allowedQueryParams));
    // user-interaction names navigations after the full URL.
    if (/[?#]/.test(span.name)) span.updateName(span.name.replace(/[?#].*$/, ''));
    const eventType = span.attributes['event_type'];
    if (typeof eventType === 'string') span.setAttribute('fusescope.rum.action.type', eventType);
  }

  onEnd(_span: ReadableSpan): void {}
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

// Stamps session attributes and drops records of unsampled sessions before
// they reach the batch processor.
export class RumLogProcessor implements LogRecordProcessor {
  constructor(
    private readonly ctx: RumContext,
    private readonly next: LogRecordProcessor,
  ) {}

  onEmit(record: SdkLogRecord, context?: Context): void {
    if (!this.ctx.sessions.get().sampled) return;
    record.setAttributes({ ...rumAttributes(this.ctx), ...record.attributes });
    this.next.onEmit(record, context);
  }

  forceFlush(): Promise<void> {
    return this.next.forceFlush();
  }
  shutdown(): Promise<void> {
    return this.next.shutdown();
  }
}
