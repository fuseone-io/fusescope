import { Activity, Database, LucideIcon, Shield } from 'lucide-react';

export const FUSESCOPE_GITHUB_URL = 'https://github.com/fuseone-io/fusescope';

export const VERSION_QUERY_KEY = ['api/v1/version/get'];

interface BrandHighlight {
	icon: LucideIcon;
	title: string;
	description: string;
}

export const BRAND_HIGHLIGHTS: BrandHighlight[] = [
	{
		icon: Activity,
		title: 'OpenTelemetry-native.',
		description: 'Send OTLP from any SDK or collector, no proprietary agent.',
	},
	{
		icon: Database,
		title: 'Fast on ClickHouse.',
		description: 'Query months of telemetry in seconds.',
	},
	{
		icon: Shield,
		title: 'Yours to run.',
		description: 'Self-hosted and open source; your data stays in your cluster.',
	},
];
