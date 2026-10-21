import { resourceFromAttributes, type Resource } from '@opentelemetry/resources';

export const DISTRO_NAME = '@fusescope/browser';
export const DISTRO_VERSION = '0.0.0-spike';

interface UADataLike {
  brands?: { brand: string; version: string }[];
  mobile?: boolean;
  platform?: string;
}

export interface AppIdentity {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  extra?: Record<string, string>;
}

// No user-agent parsing: Client Hints where available, raw UA otherwise.
export function rumResource(app: AppIdentity): Resource {
  const uaData = (navigator as Navigator & { userAgentData?: UADataLike }).userAgentData;
  const attrs: Record<string, string | boolean | string[]> = {
    'service.name': app.serviceName,
    'fusescope.rum.platform': 'web',
    'telemetry.sdk.language': 'webjs',
    'telemetry.distro.name': DISTRO_NAME,
    'telemetry.distro.version': DISTRO_VERSION,
    'user_agent.original': navigator.userAgent,
    'browser.language': navigator.language,
    ...app.extra,
  };
  if (app.serviceVersion) attrs['service.version'] = app.serviceVersion;
  if (app.environment) attrs['deployment.environment.name'] = app.environment;
  if (uaData?.brands) attrs['browser.brands'] = uaData.brands.map((b) => `${b.brand} ${b.version}`);
  if (uaData?.platform) attrs['browser.platform'] = uaData.platform;
  if (uaData?.mobile !== undefined) attrs['browser.mobile'] = uaData.mobile;
  return resourceFromAttributes(attrs);
}
