import {
	AppWindow,
	Boxes,
	Code,
	Database,
	LucideIcon,
	ScrollText,
	Server,
	Sparkles,
} from 'lucide-react';

import type { CatalogSectionId } from '../../types';

export const SECTION_ICONS: Record<CatalogSectionId, LucideIcon> = {
	apps: Code,
	collector: Server,
	infra: Boxes,
	logs: ScrollText,
	db: Database,
	frontend: AppWindow,
	ai: Sparkles,
};
