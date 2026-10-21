import type { DashboardtypesDashboardSpecDTO } from 'api/generated/services/fuseScope.schemas';
import { DashboardtypesSourceDTO } from 'api/generated/services/fuseScope.schemas';
import { rest } from 'msw';

import spec from './aiO11yOverviewSpec.json';

/**
 * The `ai-o11y-overview` system dashboard as the backend serves it; the spec is
 * a copy of `pkg/modules/dashboard/impldashboard/fs/definitions/ai-o11y-overview.json`.
 */
export const systemDashboardHandler = rest.get(
	'http://localhost/api/v2/dashboards/system/:name',
	(_req, res, ctx) =>
		res(
			ctx.status(200),
			ctx.json({
				status: 'success',
				data: {
					id: 'ai-o11y-overview',
					name: 'signoz---ai-o11y-overview',
					orgId: 'org-signoz',
					schemaVersion: 'v6',
					source: DashboardtypesSourceDTO.system,
					locked: false,
					tags: [],
					spec: spec as unknown as DashboardtypesDashboardSpecDTO,
				},
			}),
		),
);
