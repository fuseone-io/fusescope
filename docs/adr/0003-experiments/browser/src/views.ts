import type { Span, Tracer } from '@opentelemetry/api';
import { ROOT_CONTEXT } from '@opentelemetry/api';
import { scrubUrl } from './scrub';

export interface ViewTracker {
  route(): string | undefined;
  end(): void;
}

// One `view` span per History API navigation; it ends at the next navigation
// or when the page is hidden.
export function installViews(
  tracer: Tracer,
  routeOf: (path: string) => string,
  allowedQueryParams: readonly string[],
): ViewTracker {
  let current: { span: Span; path: string; route: string } | undefined;
  let lastRoute: string | undefined;

  const start = (navigationType: string) => {
    const path = location.pathname;
    if (current?.path === path) return;
    current?.span.end();
    const route = routeOf(path);
    lastRoute = route;
    current = { path, route, span: undefined as unknown as Span };
    current.span = tracer.startSpan(
      'view',
      {
        attributes: {
          'url.path': path,
          'url.full': scrubUrl(location.href, allowedQueryParams),
          'fusescope.rum.view.route': route,
          'fusescope.rum.view.navigation_type': navigationType,
        },
      },
      ROOT_CONTEXT,
    );
  };

  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args);
      start(method === 'pushState' ? 'push' : 'replace');
      return result;
    };
  }
  window.addEventListener('popstate', () => start('pop'));
  start('load');

  // A hidden page may never come back; end the view so it is exported.
  const end = () => {
    current?.span.end();
    current = undefined;
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') end();
  });

  return {
    route: () => lastRoute,
    end,
  };
}
