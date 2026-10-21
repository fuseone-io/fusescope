const ID_SEGMENT = /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,})$/i;

// Default route template: numeric, UUID and long hex segments become `:id`.
export function defaultRoute(path: string): string {
  return path
    .split('/')
    .map((seg) => (ID_SEGMENT.test(seg) ? ':id' : seg))
    .join('/');
}
