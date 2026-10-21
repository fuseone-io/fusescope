import { context, propagation, trace } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations, type Instrumentation } from '@opentelemetry/instrumentation';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { BatchSpanProcessor, StackContextManager, TracerProvider } from '@opentelemetry/sdk-trace';
import { captureError, installErrorCapture } from './errors';
import { RumLogProcessor, RumSpanProcessor, type RumContext } from './processors';
import { rumResource, type AppIdentity } from './resource';
import { defaultRoute } from './route';
import { SampledOnlyPropagator, SessionSampler } from './sampling';
import { SessionManager, type SessionRecord } from './session';
import { installViews, type ViewTracker } from './views';
import { installVitals } from './vitals';

export interface BrowserConfig extends AppIdentity {
  /** OTLP/HTTP base URL; `/v1/traces` and `/v1/logs` are appended. */
  endpoint: string;
  sessionSampleRate?: number;
  inactivityTimeoutMs?: number;
  maxSessionDurationMs?: number;
  allowedQueryParams?: string[];
  routeOf?: (path: string) => string;
  instrumentations?: Instrumentation[];
  /** Loaded after the `load` event, off the critical path. */
  lazyInstrumentations?: () => Promise<Instrumentation[]>;
  /** Read by the entry points; passed to the HTTP instrumentations. */
  propagateTo?: (string | RegExp)[];
}

export interface BrowserRum {
  session(): SessionRecord;
  captureError(error: unknown): void;
  flush(): Promise<void>;
}

export function init(config: BrowserConfig): BrowserRum {
  const sessions = new SessionManager({
    inactivityTimeoutMs: config.inactivityTimeoutMs ?? 15 * 60_000,
    maxDurationMs: config.maxSessionDurationMs ?? 4 * 3_600_000,
    sampleRate: config.sessionSampleRate ?? 1,
  });
  const allowedQueryParams = config.allowedQueryParams ?? [];
  let views: ViewTracker | undefined;
  const ctx: RumContext = { sessions, currentRoute: () => views?.route(), allowedQueryParams };
  const resource = rumResource(config);

  const tracerProvider = new TracerProvider({
    resource,
    sampler: new SessionSampler(sessions),
    spanProcessors: [
      new RumSpanProcessor(ctx),
      new BatchSpanProcessor({ exporter: new OTLPTraceExporter({ url: `${config.endpoint}/v1/traces` }), scheduledDelayMillis: 2_000 }),
    ],
  });
  trace.setGlobalTracerProvider(tracerProvider);
  context.setGlobalContextManager(new StackContextManager().enable());
  propagation.setGlobalPropagator(new SampledOnlyPropagator(new W3CTraceContextPropagator()));

  const loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new RumLogProcessor(
        ctx,
        new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: `${config.endpoint}/v1/logs` }), scheduledDelayMillis: 2_000 }),
      ),
    ],
  });
  logs.setGlobalLoggerProvider(loggerProvider);
  const logger = loggerProvider.getLogger(DISTRO_SCOPE);
  const tracer = tracerProvider.getTracer(DISTRO_SCOPE);

  installErrorCapture(logger);
  views = installViews(tracer, config.routeOf ?? defaultRoute, allowedQueryParams);
  installVitals(logger, views.route());

  for (const type of ['click', 'keydown', 'scroll', 'touchstart']) {
    window.addEventListener(type, () => sessions.touch(), { passive: true, capture: true });
  }

  const register = (instrumentations: Instrumentation[]) =>
    registerInstrumentations({ instrumentations, tracerProvider, loggerProvider });
  register(config.instrumentations ?? []);
  if (config.lazyInstrumentations) {
    const loadLazy = () => void config.lazyInstrumentations!().then(register);
    if (document.readyState === 'complete') loadLazy();
    else window.addEventListener('load', loadLazy, { once: true });
  }

  const flush = () => Promise.all([tracerProvider.forceFlush(), loggerProvider.forceFlush()]).then(() => undefined);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
  window.addEventListener('pagehide', () => {
    views?.end();
    void flush();
  });

  return {
    session: () => sessions.get(),
    captureError: (error) => captureError(logger, error),
    flush,
  };
}

const DISTRO_SCOPE = '@fusescope/browser';
