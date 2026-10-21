import {
  type Context,
  type TextMapPropagator,
  type TextMapSetter,
  type TextMapGetter,
  trace,
  TraceFlags,
} from '@opentelemetry/api';
import { SamplingDecision, type Sampler, type SamplingResult } from '@opentelemetry/sdk-trace';
import type { SessionManager } from './session';

export class SessionSampler implements Sampler {
  constructor(private readonly sessions: SessionManager) {}

  shouldSample(): SamplingResult {
    return {
      decision: this.sessions.get().sampled ? SamplingDecision.RECORD_AND_SAMPLED : SamplingDecision.NOT_RECORD,
    };
  }

  toString(): string {
    return 'SessionSampler';
  }
}

// An unsampled browser span would send `traceparent` with flags 00, and
// parent-based backend samplers would then drop the server trace too.
// Unsampled sessions send no header, so the backend samples on its own.
export class SampledOnlyPropagator implements TextMapPropagator {
  constructor(private readonly inner: TextMapPropagator) {}

  inject(context: Context, carrier: unknown, setter: TextMapSetter): void {
    const sc = trace.getSpanContext(context);
    if (!sc || (sc.traceFlags & TraceFlags.SAMPLED) === 0) return;
    this.inner.inject(context, carrier, setter);
  }

  extract(context: Context, carrier: unknown, getter: TextMapGetter): Context {
    return this.inner.extract(context, carrier, getter);
  }

  fields(): string[] {
    return this.inner.fields();
  }
}
