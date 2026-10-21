import { SeverityNumber, type Logger } from '@opentelemetry/api-logs';
import { onCLS, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';

export function vitalAttributes(m: Pick<Metric, 'name' | 'value' | 'rating' | 'navigationType'>): Record<string, string | number> {
  return {
    'event.name': 'rum.vital',
    'fusescope.rum.vital.name': m.name,
    'fusescope.rum.vital.value': m.value,
    'fusescope.rum.vital.rating': m.rating,
    'fusescope.rum.vital.navigation_type': m.navigationType,
  };
}

// web-vitals reports page-load metrics late (on hide or input), often after
// SPA navigations; they belong to the route the page was loaded on.
export function installVitals(logger: Logger, loadRoute: string | undefined): void {
  const report = (m: Metric) =>
    logger.emit({
      eventName: 'rum.vital',
      severityNumber: SeverityNumber.INFO,
      severityText: 'INFO',
      body: `${m.name} ${m.value}`,
      attributes: { ...vitalAttributes(m), ...(loadRoute ? { 'fusescope.rum.view.route': loadRoute } : {}) },
    });
  onLCP(report);
  onINP(report);
  onCLS(report);
  onTTFB(report);
}
