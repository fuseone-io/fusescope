const URL_ATTRIBUTES = ['url.full', 'http.url', 'url.query', 'url.fragment', 'http.target', 'location.href', 'url.original'];

// Drops the fragment and every query parameter not in `allowedParams`.
export function scrubUrl(raw: string, allowedParams: readonly string[] = [], base?: string): string {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return raw.split(/[?#]/)[0];
  }
  url.hash = '';
  const kept = new URLSearchParams();
  url.searchParams.forEach((v, k) => {
    if (allowedParams.includes(k)) kept.append(k, v);
  });
  url.search = kept.toString();
  return raw.startsWith('/') && !raw.startsWith('//') ? url.pathname + url.search : url.toString();
}

export function scrubAttributes(
  attrs: Record<string, unknown>,
  allowedParams: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of URL_ATTRIBUTES) {
    const v = attrs[key];
    if (typeof v !== 'string') continue;
    if (key === 'url.query') out[key] = new URLSearchParams(scrubUrl('/?' + v, allowedParams, 'http://q').split('?')[1] ?? '').toString();
    else if (key === 'url.fragment') out[key] = '';
    else out[key] = scrubUrl(v, allowedParams);
  }
  return out;
}
