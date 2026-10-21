import { context, logs, propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { BatchSpanProcessor, StackContextManager, TracerProvider } from '@opentelemetry/sdk-trace';

const resource = resourceFromAttributes({ 'service.name': 'baseline' });
trace.setGlobalTracerProvider(
  new TracerProvider({ resource, spanProcessors: [new BatchSpanProcessor({ exporter: new OTLPTraceExporter() })] }),
);
context.setGlobalContextManager(new StackContextManager().enable());
propagation.setGlobalPropagator(new W3CTraceContextPropagator());
logs.setGlobalLoggerProvider(
  new LoggerProvider({ resource, processors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })] }),
);
