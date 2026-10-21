Initial = entry chunk + statically imported chunks, each compressed separately.

| bundle | initial min KB | initial gzip KB | initial brotli KB | lazy chunks gzip KB |
|---|---:|---:|---:|---:|
| core-document-load | 94.9 | 28.3 | 25.0 | — |
| core-fetch | 99.4 | 30.3 | 26.6 | — |
| core-user-interaction | 96.3 | 28.9 | 25.4 | — |
| core-xhr | 99.5 | 30.2 | 26.5 | — |
| core | 87.1 | 26.0 | 22.9 | — |
| full | 117.3 | 34.5 | 30.3 | — |
| lazy | 100.8 | 33.4 | 29.8 | 7.2 |
| otel-only | 70.6 | 20.3 | 17.9 | — |
| upstream-fetch | 96.9 | 29.4 | 25.8 | — |
| upstream-full | 106.2 | 31.9 | 28.0 | — |
| upstream-navigation-timing | 93.7 | 27.8 | 24.5 | — |
| upstream-user-action | 92.2 | 27.7 | 24.4 | — |
| upstream-xhr | 95.7 | 28.9 | 25.3 | — |

core: minified bytes per package
| package | min KB | share |
|---|---:|---:|
| @opentelemetry/sdk-trace | 20.1 | 23% |
| @opentelemetry/sdk-logs | 15.4 | 18% |
| @opentelemetry/api | 10.6 | 12% |
| @opentelemetry/otlp-exporter-base | 9.4 | 11% |
| web-vitals | 8.7 | 10% |
| src (FuseScope modules) | 7.2 | 8% |
| @opentelemetry/core | 5.4 | 6% |
| @opentelemetry/otlp-transformer | 4.9 | 6% |
| @opentelemetry/resources | 2.3 | 3% |
| @opentelemetry/api-logs | 2.0 | 2% |
| @opentelemetry/instrumentation | 0.4 | 1% |
| @opentelemetry/semantic-conventions | 0.2 | 0% |
| @opentelemetry/exporter-trace-otlp-http | 0.2 | 0% |
| @opentelemetry/exporter-logs-otlp-http | 0.2 | 0% |

full: minified bytes per package
| package | min KB | share |
|---|---:|---:|
| @opentelemetry/sdk-trace | 20.1 | 17% |
| @opentelemetry/sdk-logs | 15.4 | 13% |
| @opentelemetry/api | 10.6 | 9% |
| @opentelemetry/otlp-exporter-base | 9.4 | 8% |
| web-vitals | 8.7 | 7% |
| src (FuseScope modules) | 7.5 | 6% |
| @opentelemetry/instrumentation-xml-http-request | 6.6 | 6% |
| @opentelemetry/instrumentation-fetch | 6.4 | 5% |
| @opentelemetry/instrumentation-user-interaction | 5.6 | 5% |
| @opentelemetry/core | 5.5 | 5% |
| @opentelemetry/otlp-transformer | 4.9 | 4% |
| @opentelemetry/instrumentation | 3.3 | 3% |
| @opentelemetry/instrumentation-document-load | 3.3 | 3% |
| @opentelemetry/web-common | 2.6 | 2% |
| @opentelemetry/resources | 2.3 | 2% |
| @opentelemetry/sdk-trace-web | 2.2 | 2% |
| @opentelemetry/api-logs | 2.0 | 2% |
| @opentelemetry/semantic-conventions | 0.4 | 0% |
| @opentelemetry/exporter-trace-otlp-http | 0.2 | 0% |
| @opentelemetry/exporter-logs-otlp-http | 0.2 | 0% |
